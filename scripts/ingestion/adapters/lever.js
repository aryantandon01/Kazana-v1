const DEFAULT_HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Kazana-Ingestion/1.0',
};

/** @type {import('../types.js').JobSourceAdapter} */
export const leverAdapter = {
  slug: 'lever',

  async fetch(source) {
    const site = source.config?.board_token || source.config?.site;
    const companyName = source.config?.company_name || source.name;

    if (!site) {
      throw new Error(`Lever source "${source.slug}" missing config.board_token`);
    }

    const apiUrl =
      source.config?.api_url ||
      `https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json`;

    const response = await fetch(apiUrl, { headers: DEFAULT_HEADERS });

    if (response.status === 404) {
      console.warn(`  Lever board not found: ${site}`);
      return [];
    }

    if (!response.ok) {
      throw new Error(`Lever API error (${site}): ${response.status} ${response.statusText}`);
    }

    const jobs = await response.json();
    if (!Array.isArray(jobs)) {
      throw new Error(`Lever API returned unexpected payload for ${site}`);
    }

    return jobs.map((job) => ({
      external_id: String(job.id),
      title: job.text,
      company_name: companyName,
      location: job.categories?.location || null,
      description: job.descriptionPlain || job.description || null,
      url: job.hostedUrl,
      tags: [job.categories?.team, job.categories?.commitment].filter(Boolean),
      posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
      updated_at: job.updatedAt ? new Date(job.updatedAt).toISOString() : null,
      raw_payload: job,
    }));
  },
};
