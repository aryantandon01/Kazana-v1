/**
 * Parse CLI arguments for the matching worker.
 * Kept out of the entrypoint so it can be unit-tested without touching the DB.
 */

/** `--all-active` = no practical discovered_at filter (still bounded by --limit-jobs). */
export const ALL_ACTIVE_LOOKBACK_HOURS = 24 * 365 * 100;

export function parseMatchingArgs(argv = []) {
  const opts = {
    jobId: null,
    userId: null,
    sinceHours: null,
    limitJobs: null,
    enqueueNotifications: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--job': {
        const value = takeValue(argv, i + 1);
        if (value) {
          opts.jobId = value;
          i += 1;
        }
        break;
      }
      case '--user': {
        const value = takeValue(argv, i + 1);
        if (value) {
          opts.userId = value;
          i += 1;
        }
        break;
      }
      case '--since-hours': {
        const value = Number(takeValue(argv, i + 1));
        if (Number.isFinite(value) && value >= 0) {
          opts.sinceHours = value;
          i += 1;
        }
        break;
      }
      case '--limit-jobs': {
        const value = Number(takeValue(argv, i + 1));
        if (Number.isFinite(value) && value > 0) {
          opts.limitJobs = Math.floor(value);
          i += 1;
        }
        break;
      }
      case '--no-notify':
        opts.enqueueNotifications = false;
        break;
      case '--all-active':
        opts.sinceHours = ALL_ACTIVE_LOOKBACK_HOURS;
        break;
      default:
        break;
    }
  }

  return opts;
}

function takeValue(argv, index) {
  const value = argv[index];
  return value && !value.startsWith('--') ? value : null;
}
