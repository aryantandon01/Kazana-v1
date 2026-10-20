/**
 * Parse CLI arguments for the manual WhatsApp bridge.
 * Kept out of the entrypoint so it can be unit-tested without touching the DB.
 */

export function parseManualArgs(argv = []) {
  const opts = {
    limit: 50,
    includeStale: false,
    confirmSent: false,
    ids: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    switch (arg) {
      case '--limit': {
        const value = Number(takeValue(argv, i + 1));
        if (Number.isFinite(value) && value > 0) {
          opts.limit = Math.floor(value);
          i += 1;
        }
        break;
      }
      case '--include-stale':
        opts.includeStale = true;
        break;
      case '--confirm-sent':
        opts.confirmSent = true;
        break;
      case '--id': {
        const value = takeValue(argv, i + 1);
        if (value) {
          opts.ids.push(value);
          i += 1;
        }
        break;
      }
      case '--help':
      case '-h':
        opts.help = true;
        break;
      default:
        break;
    }
  }

  return opts;
}

function takeValue(argv, index) {
  const value = argv[index];
  return value && !value.startsWith('-') ? value : null;
}
