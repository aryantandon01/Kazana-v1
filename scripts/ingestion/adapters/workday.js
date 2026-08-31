const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'Kazana-Ingestion/1.0',
};

const PAGE_SIZE = 20;
const DETAIL_CONCURRENCY = 4;
const REQUEST_DELAY_MS = 150;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getWorkdayConfig(source) {
  const tenant = source.config?.board_token || source.config?.tenant;
  const wdServer = source.config?.wd_server || 'wd5';
  const site = source.config?.site;
  const companyName = source.config?.company_name || source.name;

  if (!tenant || !site) {
    throw new Error(`Workday source "${source.slug}" missing config.board_token/tenant or site`);
  }

  const baseUrl = `https://${tenant}.${wdServer}.myworkdayjobs.com`;
  return { tenant, wdServer, site, companyName, baseUrl };
}

function buildListUrl(baseUrl, tenant, site) {
  return `${baseUrl}/wday/cxs/${tenant}/${site}/jobs`;
}

function buildDetailUrl(baseUrl, tenant, site, externalPath) {
  return `${baseUrl}/wday/cxs/${tenant}/${site}${externalPath}`;
}

function buildApplyUrl(baseUrl, site, externalPath) {
  return `${baseUrl}/en-US/${site}${externalPath}`;
}

function mapWorkdaySummary(posting, companyName, baseUrl, site) {
  const externalId = posting.bulletFields?.[0] || posting.externalPath;
  return {
    external_id: String(externalId),
    title: posting.title,
    company_name: companyName,
    location: posting.locationsText || null,
    description: null,
    url: buildApplyUrl(baseUrl, site, posting.externalPath),
    posted_at: parseWorkdayPostedOn(posting.postedOn),
    updated_at: parseWorkdayPostedOn(posting.postedOn),
    raw_payload: posting,
    externalPath: posting.externalPath,
  };
}

function mapWorkdayDetail(summary, detail, companyName, baseUrl, site) {
  const info = detail?.jobPostingInfo || {};
  const locations = [
    info.location,
    ...(info.additionalLocations || []).map((loc) => loc.location || loc),
  ].filter(Boolean);

  return {
    external_id: summary.external_id,
    title: info.title || summary.title,
    company_name: companyName,
    location: locations.length ? locations.join('; ') : summary.location,
    description: info.jobDescription || null,
    url: info.externalUrl || summary.url || buildApplyUrl(baseUrl, site, summary.externalPath),
    posted_at: summary.posted_at,
    updated_at: summary.updated_at,
    raw_payload: { summary: summary.raw_payload, detail },
  };
}

function parseWorkdayPostedOn(value) {
  if (!value) return null;
  const isoMatch = value.match(/\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return new Date(isoMatch[0]).toISOString();
  return null;
}

async function fetchJson(url, options = {}) {
  const { tenant, site, baseUrl } = options.workday || {};
  const response = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      'Accept-Language': 'en-US',
      ...(baseUrl && site
        ? { Referer: `${baseUrl}/en-US/${site}` }
        : {}),
      ...options.headers,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Workday API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function fetchAllSummaries(listUrl, workdayMeta) {
  const summaries = [];
  let offset = 0;
  let total = null;

  while (total === null || offset < total) {
    const body = await fetchJson(listUrl, {
      method: 'POST',
      body: JSON.stringify({
        appliedFacets: {},
        limit: PAGE_SIZE,
        offset,
        searchText: '',
      }),
      workday: workdayMeta,
    });

    if (!body) break;

    total = body.total ?? summaries.length;
    const batch = body.jobPostings || [];
    if (!batch.length) break;

    summaries.push(...batch);
    offset += PAGE_SIZE;

    if (batch.length < PAGE_SIZE) break;
    await sleep(REQUEST_DELAY_MS);
  }

  return summaries;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
      await sleep(REQUEST_DELAY_MS);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** @type {import('../types.js').JobSourceAdapter} */
export const workdayAdapter = {
  slug: 'workday',

  async fetch(source, options = {}) {
    const mode = options.mode || 'full';
    const { tenant, site, companyName, baseUrl } = getWorkdayConfig(source);
    const listUrl = buildListUrl(baseUrl, tenant, site);

    const postings = await fetchAllSummaries(listUrl, { tenant, site, baseUrl });
    if (!postings.length) {
      if (mode === 'incremental') {
        console.warn(`  Workday board returned no jobs: ${tenant}/${site}`);
      }
      return { jobs: [], allExternalIds: [] };
    }

    const summaries = postings.map((posting) =>
      mapWorkdaySummary(posting, companyName, baseUrl, site),
    );
    const allExternalIds = summaries.map((job) => job.external_id);

    if (mode === 'full') {
      console.log(`  Workday: fetching details for ${summaries.length} jobs`);
      const jobs = await mapWithConcurrency(summaries, DETAIL_CONCURRENCY, async (summary) => {
        const detail = await fetchJson(buildDetailUrl(baseUrl, tenant, site, summary.externalPath), {
          workday: { tenant, site, baseUrl },
        });
        return mapWorkdayDetail(summary, detail, companyName, baseUrl, site);
      });
      return { jobs, allExternalIds };
    }

    const existingIds = options.existingIds || new Set();
    const since = options.since ? new Date(options.since) : null;
    const needsDetail = summaries.filter((summary) => {
      if (!existingIds.has(summary.external_id)) return true;
      if (since && summary.updated_at && new Date(summary.updated_at) > since) return true;
      return false;
    });

    console.log(`  Workday incremental: ${needsDetail.length} new of ${summaries.length} listed`);

    const jobs = await mapWithConcurrency(needsDetail, DETAIL_CONCURRENCY, async (summary) => {
      const detail = await fetchJson(buildDetailUrl(baseUrl, tenant, site, summary.externalPath), {
        workday: { tenant, site, baseUrl },
      });
      return mapWorkdayDetail(summary, detail, companyName, baseUrl, site);
    });

    return { jobs, allExternalIds };
  },
};
