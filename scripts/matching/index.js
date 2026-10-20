#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { runMatching } from '../../lib/matching/run.js';
import { parseMatchingArgs } from './args.js';

const options = parseMatchingArgs(process.argv.slice(2));

console.log('Kazana matching worker');
if (options.jobId) console.log(`Job: ${options.jobId}`);
if (options.userId) console.log(`User: ${options.userId}`);
if (options.sinceHours != null) {
  console.log(`Lookback: ${options.sinceHours}h (discovered_at)`);
}
if (options.limitJobs) console.log(`Job cap: ${options.limitJobs}`);
if (!options.enqueueNotifications) console.log('Notifications: disabled');

runMatching(options)
  .then((result) => {
    console.log(
      `Jobs: ${result.jobs}, Matches: ${result.matched}, Enqueued: ${result.enqueued}, Users: ${result.users}`,
    );
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
