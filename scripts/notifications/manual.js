#!/usr/bin/env node
import '../../lib/loadEnv.js';
import { getAdminClient } from '../../lib/supabase/admin.js';
import { listManualWhatsAppQueue, markManualSent } from '../../lib/notifications/manual.js';
import { parseManualArgs } from './manualArgs.js';

const USAGE = `Kazana manual WhatsApp bridge

Lists pending WhatsApp notifications as wa.me links. Open a link, send it from
the official WhatsApp app/desktop, then mark the row sent.

Usage:
  npm run notify:manual [-- --limit 50] [--include-stale]
  npm run notify:manual -- --confirm-sent --id <uuid> [--id <uuid> ...]

Options:
  --limit N        Max rows to list (default 50)
  --include-stale  Include rows older than 7 days (skipped by default)
  --confirm-sent   Mark the given --id rows as sent
  --id <uuid>      Queue row id to mark sent (repeatable)
  --help           Show this help
`;

const opts = parseManualArgs(process.argv.slice(2));

if (opts.help) {
  console.log(USAGE.trim());
  process.exit(0);
}

async function main() {
  const supabaseAdmin = getAdminClient();

  if (opts.confirmSent) {
    if (!opts.ids.length) {
      console.error('--confirm-sent requires at least one --id <uuid> (see --help).');
      process.exit(1);
    }

    const result = await markManualSent(supabaseAdmin, opts.ids);
    const requested = [...new Set(opts.ids)];
    const missing = requested.filter((id) => !result.ids.includes(id));

    console.log(`Kazana manual WhatsApp bridge`);
    console.log(`Marked sent: ${result.marked}`);
    if (missing.length) {
      console.log(`Not marked (not pending): ${missing.join(', ')}`);
    }
    return;
  }

  const { items, skipped, scanned } = await listManualWhatsAppQueue(supabaseAdmin, {
    limit: opts.limit,
    includeStale: opts.includeStale,
  });

  console.log('Kazana manual WhatsApp bridge');
  console.log(`Scanned: ${scanned} pending WhatsApp row(s)`);

  if (!items.length) {
    console.log('Nothing to send.');
  } else {
    items.forEach((item, index) => {
      console.log('');
      console.log(`[${index + 1}] ${item.id}`);
      console.log(`    ${item.link}`);
      console.log(`    ${item.text}`);
    });
    console.log('');
    console.log('After sending in WhatsApp, mark them sent:');
    console.log(
      `  npm run notify:manual -- --confirm-sent ${items.map((i) => `--id ${i.id}`).join(' ')}`,
    );
  }

  if (skipped.disabled || skipped.no_phone || skipped.stale) {
    console.log(
      `Skipped: ${skipped.disabled} opt-out, ${skipped.no_phone} invalid phone, ${skipped.stale} stale (use --include-stale to list old rows)`,
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
