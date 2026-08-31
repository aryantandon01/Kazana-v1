/**
 * Freshness — Kazana's signature signal on job cards.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function parseTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function relativeShort(iso, now = new Date()) {
  const t = parseTime(iso);
  if (!t) return null;
  const ms = now - t;
  if (ms < 0) return null;
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return null;
}

function isToday(iso, now = new Date()) {
  const t = parseTime(iso);
  if (!t) return false;
  return (
    t.getFullYear() === now.getFullYear() &&
    t.getMonth() === now.getMonth() &&
    t.getDate() === now.getDate()
  );
}

/**
 * @param {{ discovered_at?: string|null, last_updated_at?: string|null, job_version?: number|null, posted_at?: string|null, created_at?: string|null }} job
 * @param {Date} [now]
 */
export function getFreshnessBadge(job, now = new Date()) {
  const display = getJobFreshnessDisplay(job, now);
  return display.badge;
}

/**
 * Rich freshness for cards — badge + primary line + secondary line.
 * @returns {{
 *   badge: { kind: 'new'|'updated'|'recent'|null, label: string|null },
 *   primary: string|null,
 *   secondary: string|null,
 *   isLive: boolean,
 * }}
 */
export function getJobFreshnessDisplay(job, now = new Date()) {
  const discovered = parseTime(job.discovered_at || job.created_at);
  const updated = parseTime(job.last_updated_at);
  const posted = parseTime(job.posted_at);
  const version = job.job_version || 1;

  const discoveredRel = relativeShort(job.discovered_at || job.created_at, now);
  const updatedRel = relativeShort(job.last_updated_at, now);
  const postedToday = isToday(job.posted_at, now);

  // Newly discovered (within 24h) — strongest signal
  if (discovered && now - discovered <= DAY) {
    return {
      badge: { kind: 'new', label: 'NEW' },
      primary: discoveredRel ? `Discovered ${discoveredRel}` : 'Discovered today',
      secondary: postedToday ? 'Posted today' : posted ? `Posted ${relativeShort(job.posted_at, now) || formatShortDate(job.posted_at)}` : null,
      isLive: discoveredRel === 'just now' || (discovered && now - discovered <= HOUR),
    };
  }

  // Meaningfully updated recently
  if (version > 1 && updated && now - updated <= 3 * DAY) {
    const kind = now - updated <= DAY ? 'updated' : 'recent';
    return {
      badge: { kind, label: kind === 'updated' ? 'Updated' : 'Recently updated' },
      primary: updatedRel ? `Updated ${updatedRel}` : 'Recently updated',
      secondary: discoveredRel ? `Discovered ${discoveredRel}` : null,
      isLive: updated && now - updated <= 6 * HOUR,
    };
  }

  if (postedToday) {
    return {
      badge: { kind: 'recent', label: 'Posted today' },
      primary: 'Posted today',
      secondary: discoveredRel ? `Discovered ${discoveredRel}` : null,
      isLive: false,
    };
  }

  if (discoveredRel) {
    return {
      badge: { kind: null, label: null },
      primary: `Discovered ${discoveredRel}`,
      secondary: posted ? `Posted ${relativeShort(job.posted_at, now) || formatShortDate(job.posted_at)}` : null,
      isLive: false,
    };
  }

  return { badge: { kind: null, label: null }, primary: null, secondary: posted ? `Posted ${formatShortDate(job.posted_at)}` : null, isLive: false };
}

function formatShortDate(iso) {
  const t = parseTime(iso);
  if (!t) return null;
  return t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
