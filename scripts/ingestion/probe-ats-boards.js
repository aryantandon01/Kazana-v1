#!/usr/bin/env node
/**
 * Probe company names from SQL seed files against public ATS APIs.
 * Usage:
 *   node scripts/ingestion/probe-ats-boards.js
 *   node scripts/ingestion/probe-ats-boards.js --write
 */
import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

const COMPANY_SQL_FILES = [
  'create_companies_table.sql',
  'db/migrations/20260707020000_expand_companies_international.sql',
];

const TOKEN_ALIASES = {
  square: 'block',
  cruise: 'getcruise',
  alphabetgoogle: 'google',
  metafacebook: 'meta',
  facebookmeta: 'meta',
  bytedancetiktok: 'bytedance',
  twitterx: 'twitter',
  sumologic: 'sumologic',
  stitchfix: 'stitchfix',
  cockroachlabs: 'cockroachlabs',
  akunacapital: 'akunacapital',
  khanacademy: 'khanacademy',
  epicgames: 'epicgames',
  tataconsultancyservices: 'tcs',
  hcltechnologies: 'hcl',
  techmahindra: 'techmahindra',
  makemytrip: 'makemytrip',
  deliveryhero: 'deliveryhero',
  traderepublic: 'traderepublic',
  fisherpaykelhealthcare: 'fisherpaykel',
  palantirtechnologies: 'palantir',
  dassaultsystmes: 'dassaultsystemes',
  btgroup: 'bt',
  vodafoneuk: 'vodafone',
  sealimited: 'sea',
  antgroup: 'antgroup',
  urbancompany: 'urbancompany',
  policybazaar: 'policybazaar',
};

function parseCompanyNames() {
  const names = new Set();

  for (const relativePath of COMPANY_SQL_FILES) {
    const absolutePath = join(ROOT, relativePath);
    try {
      const sql = readFileSync(absolutePath, 'utf8');
      for (const match of sql.matchAll(/\('([^']+)'\)/g)) {
        names.add(match[1]);
      }
    } catch {
      // Optional file may not exist yet locally.
    }
  }

  return [...names].sort((a, b) => a.localeCompare(b));
}

function tokenCandidates(name) {
  const tokens = new Set();
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, '');
  tokens.add(normalized);

  const paren = name.match(/\(([^)]+)\)/);
  if (paren) {
    tokens.add(paren[1].toLowerCase().replace(/[^a-z0-9]+/g, ''));
  }

  const beforeParen = name.split('(')[0].trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (beforeParen) tokens.add(beforeParen);

  for (const token of [...tokens]) {
    if (TOKEN_ALIASES[token]) tokens.add(TOKEN_ALIASES[token]);
  }

  return [...tokens];
}

async function probeBoard(token, provider) {
  if (provider === 'ashby') {
    try {
      const response = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${token}`, {
        headers: { 'User-Agent': 'Kazana-Probe/1.0' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) return 0;
      const body = await response.json();
      return body.jobs?.length || 0;
    } catch {
      return 0;
    }
  }

  const url =
    provider === 'greenhouse'
      ? `https://boards-api.greenhouse.io/v1/boards/${token}/jobs`
      : `https://api.lever.co/v0/postings/${token}?mode=json`;

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Kazana-Probe/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return 0;

    const body = await response.json();
    return provider === 'greenhouse' || provider === 'ashby'
      ? body.jobs?.length || 0
      : Array.isArray(body)
        ? body.length
        : 0;
  } catch {
    return 0;
  }
}

function formatBoards(boards) {
  return boards
    .sort((a, b) => a.companyName.localeCompare(b.companyName))
    .map((board) => `  { companyName: '${board.companyName.replace(/'/g, "\\'")}', boardToken: '${board.boardToken}' },`)
    .join('\n');
}

function writeAshbyBoardsFile(ashby) {
  const contents = `/**
 * Verified Ashby public job boards.
 * @typedef {{ companyName: string, boardToken: string }} AshbyBoard
 */

/** @type {AshbyBoard[]} */
export const ashbyBoards = [
${formatBoards(ashby)}
];
`;
  writeFileSync(join(__dirname, 'data/ashby-boards.js'), contents, 'utf8');
}

function writeAtsBoardsFile(greenhouse, lever) {
  const contents = `/**
 * Public Greenhouse / Lever board mappings for companies in company SQL seeds.
 * Board tokens verified via scripts/ingestion/probe-ats-boards.js --write
 *
 * @typedef {{ companyName: string, boardToken: string }} AtsBoard
 */

/** @type {AtsBoard[]} */
export const greenhouseBoards = [
${formatBoards(greenhouse)}
];

/** @type {AtsBoard[]} */
export const leverBoards = [
${formatBoards(lever)}
];
`;

  writeFileSync(join(__dirname, 'data/ats-boards.js'), contents, 'utf8');
}

async function main() {
  const write = process.argv.includes('--write');
  const names = parseCompanyNames();
  const greenhouse = [];
  const lever = [];
  const ashby = [];

  console.log(`Probing ${names.length} companies...\n`);

  for (const name of names) {
    let bestGh = null;
    let bestLever = null;
    let bestAshby = null;

    for (const token of tokenCandidates(name)) {
      const [ghCount, leverCount, ashbyCount] = await Promise.all([
        probeBoard(token, 'greenhouse'),
        probeBoard(token, 'lever'),
        probeBoard(token, 'ashby'),
      ]);

      if (ghCount > 0 && (!bestGh || ghCount > bestGh.count)) {
        bestGh = { companyName: name, boardToken: token, count: ghCount };
      }
      if (leverCount > 0 && (!bestLever || leverCount > bestLever.count)) {
        bestLever = { companyName: name, boardToken: token, count: leverCount };
      }
      if (ashbyCount > 0 && (!bestAshby || ashbyCount > bestAshby.count)) {
        bestAshby = { companyName: name, boardToken: token, count: ashbyCount };
      }
    }

    if (bestGh) greenhouse.push(bestGh);
    if (bestLever) lever.push(bestLever);
    if (bestAshby) ashby.push(bestAshby);

    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  console.log(`Found ${greenhouse.length} GH + ${lever.length} Lever + ${ashby.length} Ashby boards\n`);
  console.log(JSON.stringify({ greenhouse, lever, ashby }, null, 2));

  if (write) {
    writeAtsBoardsFile(dedupeBoards(greenhouse), dedupeBoards(lever));
    writeAshbyBoardsFile(dedupeBoards(ashby));
    console.log('\nWrote scripts/ingestion/data/ats-boards.js');
    console.log('Wrote scripts/ingestion/data/ashby-boards.js');
    console.log('Workday boards are curated manually in scripts/ingestion/data/workday-boards.js');
  }
}

function dedupeBoards(boards) {
  const byToken = new Map();
  for (const board of boards) {
    const existing = byToken.get(board.boardToken);
    if (!existing || board.count > existing.count) {
      byToken.set(board.boardToken, board);
    }
  }
  return [...byToken.values()];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
