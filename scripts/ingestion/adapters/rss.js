import { XMLParser } from 'fast-xml-parser';
import { createHash } from 'crypto';

/** @type {import('../types.js').JobSourceAdapter} */
export const rssAdapter = {
  slug: 'rss',

  async fetch(source) {
    const feedUrl = source.config?.feed_url;
    if (!feedUrl) {
      throw new Error(`RSS source "${source.slug}" missing config.feed_url`);
    }

    const response = await fetch(feedUrl, {
      headers: { Accept: 'application/rss+xml, application/xml, text/xml', 'User-Agent': 'Kazana-Ingestion/1.0' },
    });

    if (!response.ok) {
      throw new Error(`RSS fetch error (${source.slug}): ${response.status} ${response.statusText}`);
    }

    const xml = await response.text();
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const parsed = parser.parse(xml);

    const channel = parsed?.rss?.channel || parsed?.feed;
    if (!channel) {
      throw new Error(`Invalid RSS/Atom feed: ${source.slug}`);
    }

    const items = channel.item || channel.entry || [];
    const itemList = Array.isArray(items) ? items : [items];

    return itemList.map((item) => {
      const title = item.title?.['#text'] ?? item.title ?? '';
      const link = extractLink(item);
      const description = item.description?.['#text'] ?? item.description ?? item.summary ?? item.content ?? '';
      const pubDate = item.pubDate || item.published || item.updated || null;
      const guid = item.guid?.['#text'] ?? item.guid ?? item.id ?? link ?? title;
      const externalId = guid
        ? String(guid)
        : createHash('sha256').update(`${title}|${link}`).digest('hex').slice(0, 32);

      const { company, location } = parseWwrTitle(title);

      return {
        external_id: externalId,
        title: stripCdata(title),
        company_name: company,
        location,
        description: stripCdata(description),
        url: link,
        posted_at: pubDate ? new Date(pubDate).toISOString() : null,
        raw_payload: item,
      };
    });
  },
};

function stripCdata(value) {
  if (typeof value !== 'string') return String(value ?? '');
  return value.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
}

function extractLink(item) {
  if (typeof item.link === 'string') return item.link;
  if (item.link?.['@_href']) return item.link['@_href'];
  if (Array.isArray(item.link)) {
    const alt = item.link.find((l) => l['@_rel'] !== 'self') || item.link[0];
    return alt?.['@_href'] || alt;
  }
  return item.guid || '';
}

/** We Work Remotely titles: "Company: Role" */
function parseWwrTitle(title) {
  const clean = stripCdata(title);
  const colonIdx = clean.indexOf(':');
  if (colonIdx > 0) {
    return {
      company: clean.slice(0, colonIdx).trim(),
      location: 'Remote',
    };
  }
  return { company: 'Unknown', location: 'Remote' };
}
