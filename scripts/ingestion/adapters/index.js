import { remotiveAdapter } from './remotive.js';
import { rssAdapter } from './rss.js';
import { greenhouseAdapter } from './greenhouse.js';
import { leverAdapter } from './lever.js';
import { ashbyAdapter } from './ashby.js';
import { workdayAdapter } from './workday.js';
import { eightfoldAdapter } from './eightfold.js';

/** @type {Map<string, import('../types.js').JobSourceAdapter>} */
const adaptersBySlug = new Map([
  [remotiveAdapter.slug, remotiveAdapter],
]);

/** RSS-backed sources use the generic rss adapter */
const rssSlugs = new Set(['weworkremotely-programming']);

const adaptersByProvider = new Map([
  ['greenhouse', greenhouseAdapter],
  ['lever', leverAdapter],
  ['ashby', ashbyAdapter],
  ['workday', workdayAdapter],
  ['eightfold', eightfoldAdapter],
]);

/**
 * @param {import('../types.js').JobSourceRecord} source
 * @returns {import('../types.js').JobSourceAdapter}
 */
export function getAdapterForSource(source) {
  if (source.source_type === 'rss' || rssSlugs.has(source.slug)) {
    return { ...rssAdapter, slug: source.slug };
  }

  const provider = source.config?.provider;
  if (provider && adaptersByProvider.has(provider)) {
    const adapter = adaptersByProvider.get(provider);
    return { ...adapter, slug: source.slug };
  }

  const adapter = adaptersBySlug.get(source.slug);
  if (!adapter) {
    throw new Error(`No adapter registered for source slug: ${source.slug}`);
  }
  return adapter;
}

export function listAdapterSlugs() {
  return [
    ...adaptersBySlug.keys(),
    ...rssSlugs,
    ...adaptersByProvider.keys(),
    'gh-* (per-company Greenhouse boards)',
    'lever-* (per-company Lever boards)',
    'ashby-* (per-company Ashby boards)',
    'wd-* (per-company Workday career sites)',
    'ef-* (per-company Eightfold career sites)',
  ];
}
