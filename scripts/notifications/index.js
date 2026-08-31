#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { runNotifications } from '../../lib/notifications/dispatch.js';

console.log('Kazana notification worker');
runNotifications()
  .then((r) => console.log(`Sent: ${r.sent}, Skipped: ${r.skipped}, Failed: ${r.failed}`))
  .catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
