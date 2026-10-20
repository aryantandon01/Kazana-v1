/**
 * Shared notification message shaping.
 *
 * Kept apart from `dispatch.js` so tools that only need the copy (the manual
 * WhatsApp bridge) do not pull the worker, providers and Expo into memory.
 */

/**
 * Normalise a `notification_queue` row into the fields every channel needs.
 * @param {object} row
 */
export function buildNotification(row) {
  const payload = row.payload || {};
  return {
    title: row.title,
    body: row.body,
    payload,
    jobTitle: payload.job_title || row.title,
    companyName: payload.company_name || '',
    scorePercent: payload.score != null ? Math.round(payload.score * 100) : '',
  };
}
