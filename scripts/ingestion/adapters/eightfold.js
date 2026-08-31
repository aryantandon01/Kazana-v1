const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Kazana-Ingestion/1.0',
};

const PAGE_SIZE = 10;
const DETAIL_CONCURRENCY = 4;
const REQUEST_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getEightfoldConfig(source) {
  const host = source.config?.host || source.config?.board_token;
  const domain = source.config?.domain;
  const companyName = source.config?.company_name || source.name;

  if (!host) {
    throw new Error(`Eightfold source "${source.slug}" missing config.host or board_token`);
  }

  const baseUrl = `https://${host}.eightfold.ai`;
  return { host, domain, companyName, baseUrl };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.referer ? { Referer: options.referer } : {}),
      ...options.headers,
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Eightfold request failed: ${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);
  if (!text) return null;
  return JSON.parse(text);
}

async function resolveDomain(host, configuredDomain, baseUrl) {
  if (configuredDomain) return configuredDomain;

  const html = await fetchText(`${baseUrl}/careers`, { referer: `${baseUrl}/careers` });
  if (!html) {
    throw new Error(`Eightfold careers page not found for host: ${host}`);
  }

  const match = html.match(/EF_GROUP_ID\s*=\s*"([^"]+)"/);
  if (!match) {
    throw new Error(`Eightfold domain not found on careers page for host: ${host}`);
  }

  return match[1];
}

function mapEightfoldSummary(position, companyName, baseUrl) {
  return {
    external_id: String(position.id),
    title: position.name,
    company_name: companyName,
    location: (position.locations || position.standardizedLocations || []).join('; ') || null,
    description: null,
    url: position.positionUrl?.startsWith('http')
      ? position.positionUrl
      : `${baseUrl}${position.positionUrl || `/careers/job/${position.id}`}`,
    tags: [position.department, position.workLocationOption].filter(Boolean),
    posted_at: position.postedTs ? new Date(position.postedTs * 1000).toISOString() : null,
    updated_at: position.postedTs ? new Date(position.postedTs * 1000).toISOString() : null,
    raw_payload: position,
    positionId: position.id,
  };
}

function mapEightfoldDetail(summary, detail, companyName, baseUrl) {
  const data = detail?.data || detail || {};
  return {
    external_id: summary.external_id,
    title: data.name || summary.title,
    company_name: companyName,
    location: (data.locations || data.standardizedLocations || []).join('; ') || summary.location,
    description: data.jobDescription || null,
    url: data.positionUrl?.startsWith('http')
      ? data.positionUrl
      : summary.url || `${baseUrl}${data.positionUrl || `/careers/job/${summary.positionId}`}`,
    tags: summary.tags,
    posted_at: data.postedTs ? new Date(data.postedTs * 1000).toISOString() : summary.posted_at,
    updated_at: data.postedTs ? new Date(data.postedTs * 1000).toISOString() : summary.updated_at,
    raw_payload: { summary: summary.raw_payload, detail: data },
  };
}

async function fetchAllSummaries(baseUrl, domain) {
  const summaries = [];
  let start = 0;
  let total = null;

  while (total === null || start < total) {
    const url =
      `${baseUrl}/api/pcsx/search?domain=${encodeURIComponent(domain)}` +
      `&query=&location=&start=${start}&num=${PAGE_SIZE}`;

    const body = await fetchJson(url, { referer: `${baseUrl}/careers` });
    if (!body?.data?.positions?.length) break;

    total = body.data.count ?? summaries.length + body.data.positions.length;
    summaries.push(...body.data.positions);

    if (body.data.positions.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
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
export const eightfoldAdapter = {
  slug: 'eightfold',

  async fetch(source, options = {}) {
    const mode = options.mode || 'full';
    const { host, companyName, baseUrl } = getEightfoldConfig(source);
    const domain = await resolveDomain(host, source.config?.domain, baseUrl);

    const postings = await fetchAllSummaries(baseUrl, domain);
    if (!postings.length) {
      console.warn(`  Eightfold board returned no jobs: ${host}`);
      return { jobs: [], allExternalIds: [] };
    }

    const summaries = postings.map((position) =>
      mapEightfoldSummary(position, companyName, baseUrl),
    );
    const allExternalIds = summaries.map((job) => job.external_id);

    const fetchDetails = async (items) =>
      mapWithConcurrency(items, DETAIL_CONCURRENCY, async (summary) => {
        const detailUrl =
          `${baseUrl}/api/pcsx/position_details?domain=${encodeURIComponent(domain)}` +
          `&position_id=${encodeURIComponent(summary.positionId)}`;
        const detail = await fetchJson(detailUrl, { referer: `${baseUrl}/careers` });
        return mapEightfoldDetail(summary, detail, companyName, baseUrl);
      });

    if (mode === 'full') {
      console.log(`  Eightfold: fetching details for ${summaries.length} jobs`);
      const jobs = await fetchDetails(summaries);
      return { jobs, allExternalIds };
    }

    const existingIds = options.existingIds || new Set();
    const since = options.since ? new Date(options.since) : null;
    const needsDetail = summaries.filter((summary) => {
      if (!existingIds.has(summary.external_id)) return true;
      if (since && summary.updated_at && new Date(summary.updated_at) > since) return true;
      return false;
    });

    console.log(`  Eightfold incremental: ${needsDetail.length} new of ${summaries.length} listed`);
    const jobs = await fetchDetails(needsDetail);
    return { jobs, allExternalIds };
  },
};
