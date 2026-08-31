/** @type {import('../types.js').JobSourceAdapter} */
export const remotiveAdapter = {
  slug: 'remotive',

  async fetch(source) {
    const apiUrl = source.config?.api_url || 'https://remotive.com/api/remote-jobs';
    const response = await fetch(apiUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'Kazana-Ingestion/1.0' },
    });

    if (!response.ok) {
      throw new Error(`Remotive API error: ${response.status} ${response.statusText}`);
    }

    const body = await response.json();
    const jobs = body.jobs || [];

    return jobs.map((job) => ({
      external_id: String(job.id),
      title: job.title,
      company_name: job.company_name,
      location: job.candidate_required_location || 'Remote',
      description: job.description,
      url: job.url,
      job_family: null,
      tags: job.tags ? String(job.tags).split(',').map((t) => t.trim()) : [],
      posted_at: job.publication_date ? new Date(job.publication_date).toISOString() : null,
      raw_payload: job,
    }));
  },
};
