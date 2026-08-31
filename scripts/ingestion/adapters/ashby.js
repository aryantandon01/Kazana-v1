const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Kazana-Ingestion/1.0',
};

function mapAshbyJob(job, companyName) {
  const locations = [job.location, ...(job.secondaryLocations || []).map((loc) => loc.location)]
    .filter(Boolean);

  return {
    external_id: String(job.id),
    title: job.title,
    company_name: companyName,
    location: locations.length ? locations.join('; ') : job.isRemote ? 'Remote' : null,
    description: job.descriptionPlain || job.descriptionHtml || null,
    url: job.jobUrl || job.applyUrl,
    tags: [job.department, job.team, job.employmentType].filter(Boolean),
    posted_at: job.publishedAt ? new Date(job.publishedAt).toISOString() : null,
    updated_at: job.publishedAt ? new Date(job.publishedAt).toISOString() : null,
    raw_payload: job,
  };
}

/** @type {import('../types.js').JobSourceAdapter} */
export const ashbyAdapter = {
  slug: 'ashby',

  async fetch(source) {
    const boardToken = source.config?.board_token;
    const companyName = source.config?.company_name || source.name;

    if (!boardToken) {
      throw new Error(`Ashby source "${source.slug}" missing config.board_token`);
    }

    const apiUrl =
      source.config?.api_url ||
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(boardToken)}`;

    const response = await fetch(apiUrl, { headers: DEFAULT_HEADERS });

    if (response.status === 404) {
      console.warn(`  Ashby board not found: ${boardToken}`);
      return { jobs: [], allExternalIds: [] };
    }

    if (!response.ok) {
      throw new Error(`Ashby API error (${boardToken}): ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    const listedJobs = body.jobs || [];
    const jobs = listedJobs
      .filter((job) => job.isListed !== false)
      .map((job) => mapAshbyJob(job, companyName));

    return {
      jobs,
      allExternalIds: jobs.map((job) => job.external_id),
    };
  },
};
