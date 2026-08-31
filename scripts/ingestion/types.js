/**
 * @typedef {object} RawJob
 * @property {string|number} external_id
 * @property {string} title
 * @property {string} [company_name]
 * @property {string} [company]
 * @property {string} [location]
 * @property {string} [description]
 * @property {string} url
 * @property {string} [job_family]
 * @property {string} [level]
 * @property {string} [posted_at]
 * @property {string} [updated_at]
 * @property {string} [expires_at]
 * @property {string[]} [tags]
 * @property {string} [category]
 * @property {object} [raw_payload]
 */

/**
 * @typedef {object} NormalizedJob
 * @property {string} external_id
 * @property {string} title
 * @property {string} company_name
 * @property {string|null} location
 * @property {string|null} description
 * @property {string} url
 * @property {string|null} job_family
 * @property {string|null} level
 * @property {number|null} [years_required]
 * @property {number|null} [years_required_min]
 * @property {number|null} [years_required_max]
 * @property {object|null} [extraction]
 * @property {string|null} [extraction_version]
 * @property {string|null} [extracted_at]
 * @property {string|null} posted_at
 * @property {string|null} [updated_at]
 * @property {string|null} expires_at
 * @property {string|null} [discovered_at]
 * @property {string|null} [last_updated_at]
 * @property {number} [job_version]
 * @property {string|null} [content_hash]
 * @property {object|null} raw_payload
 */

/**
 * @typedef {object} JobSourceRecord
 * @property {string} id
 * @property {string} slug
 * @property {string} name
 * @property {string} source_type
 * @property {object} config
 * @property {boolean} is_active
 * @property {string|null} [last_fetched_at]
 */

/**
 * @typedef {'incremental' | 'full'} IngestMode
 */

/**
 * @typedef {object} FetchOptions
 * @property {IngestMode} [mode]
 * @property {string|null} [since]
 * @property {Set<string>} [existingIds]
 */

/**
 * @typedef {object} FetchResult
 * @property {RawJob[]} jobs
 * @property {string[]} allExternalIds
 */

/**
 * @typedef {object} JobSourceAdapter
 * @property {string} slug
 * @property {(source: JobSourceRecord, options?: FetchOptions) => Promise<RawJob[]|FetchResult>} fetch
 */

export {};
