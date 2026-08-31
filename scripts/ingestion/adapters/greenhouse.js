const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Kazana-Ingestion/1.0',
};

const DETAIL_CONCURRENCY = 5;

function mapGreenhouseJob(job, companyName) {
  return {
    external_id: String(job.id),
    title: job.title,
    company_name: job.company_name || companyName,
    location: job.location?.name || null,
    description: job.content || null,
    url: job.absolute_url,
    posted_at: job.first_published
      ? new Date(job.first_published).toISOString()
      : job.updated_at
        ? new Date(job.updated_at).toISOString()
        : null,
    updated_at: job.updated_at ? new Date(job.updated_at).toISOString() : null,
    raw_payload: job,
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Greenhouse API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function fetchJobWithContent(boardToken, jobId) {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs/${jobId}?content=true`;
  return fetchJson(url);
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}

/** @type {import('../types.js').JobSourceAdapter} */
export const greenhouseAdapter = {
  slug: 'greenhouse',

  async fetch(source, options = {}) {
    const boardToken = source.config?.board_token;
    const companyName = source.config?.company_name || source.name;
    const mode = options.mode || 'full';

    if (!boardToken) {
      throw new Error(`Greenhouse source "${source.slug}" missing config.board_token`);
    }

    const listUrl =
      source.config?.api_url ||
      `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`;

    const body = await fetchJson(listUrl);
    if (!body) {
      console.warn(`  Greenhouse board not found: ${boardToken}`);
      return { jobs: [], allExternalIds: [] };
    }

    const listedJobs = body.jobs || [];
    const allExternalIds = listedJobs.map((job) => String(job.id));

    if (mode === 'full') {
      const fullUrl = `${listUrl}${listUrl.includes('?') ? '&' : '?'}content=true`;
      const fullBody = await fetchJson(fullUrl);
      const jobs = (fullBody?.jobs || listedJobs).map((job) => mapGreenhouseJob(job, companyName));
      return { jobs, allExternalIds };
    }

    const existingIds = options.existingIds || new Set();
    const since = options.since ? new Date(options.since) : null;

    const jobsNeedingContent = listedJobs.filter((job) => {
      const externalId = String(job.id);
      if (!existingIds.has(externalId)) return true;
      if (since && job.updated_at && new Date(job.updated_at) > since) return true;
      return false;
    });

    console.log(`  Incremental: ${jobsNeedingContent.length} new/updated of ${listedJobs.length} listed`);

    const detailedJobs = await mapWithConcurrency(
      jobsNeedingContent,
      DETAIL_CONCURRENCY,
      async (summary) => {
        const detail = await fetchJobWithContent(boardToken, summary.id);
        return mapGreenhouseJob(detail || summary, companyName);
      },
    );

    return { jobs: detailedJobs, allExternalIds };
  },
};
