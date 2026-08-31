#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { runMatching } from '../../lib/matching/run.js';

const args = process.argv.slice(2);
let jobId = null;
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--job' && args[i + 1]) {
    jobId = args[i + 1];
    i += 1;
  }
}

console.log('Kazana matching worker');
runMatching({ jobId })
  .then((result) => {
    console.log(`Jobs: ${result.jobs}, Matches: ${result.matched}, Enqueued: ${result.enqueued}`);
  })
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
