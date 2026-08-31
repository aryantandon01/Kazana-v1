/**
 * Country / continent helpers for job location matching & filters.
 */

/** Location substrings used when matching jobs to a country name. */
export const COUNTRY_LOCATION_ALIASES = {
  'United States': ['United States', 'USA', 'U.S.', 'US', 'America', 'Remote - US'],
  Canada: ['Canada', 'Toronto', 'Vancouver', 'Montreal', 'Calgary', 'Ottawa', 'Remote - Canada'],
  'United Kingdom': [
    'United Kingdom',
    'UK',
    'U.K.',
    'England',
    'Scotland',
    'Wales',
    'London',
    'Manchester',
    'Remote - UK',
  ],
  Germany: ['Germany', 'Berlin', 'Munich', 'Frankfurt', 'Hamburg', 'Remote - Germany'],
  France: ['France', 'Paris', 'Lyon', 'Remote - France'],
  India: [
    'India',
    'Bangalore',
    'Bengaluru',
    'Mumbai',
    'Hyderabad',
    'Pune',
    'Delhi',
    'Gurgaon',
    'Gurugram',
    'Noida',
    'Chennai',
    'Remote - India',
  ],
  China: ['China', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou', 'Hangzhou', 'Remote - China'],
  Japan: ['Japan', 'Tokyo', 'Osaka', 'Remote - Japan'],
  Australia: ['Australia', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Remote - Australia'],
  'New Zealand': ['New Zealand', 'Auckland', 'Wellington', 'Remote - New Zealand'],
  Singapore: ['Singapore', 'Remote - Singapore'],
  Netherlands: ['Netherlands', 'Amsterdam', 'Remote - Netherlands'],
  Ireland: ['Ireland', 'Dublin', 'Remote - Ireland'],
  Switzerland: ['Switzerland', 'Zurich', 'Geneva', 'Remote - Switzerland'],
  Brazil: ['Brazil', 'São Paulo', 'Sao Paulo', 'Remote - Brazil'],
  Mexico: ['Mexico', 'Mexico City', 'Remote - Mexico'],
  'South Korea': ['South Korea', 'Korea', 'Seoul', 'Remote - Korea'],
  Israel: ['Israel', 'Tel Aviv', 'Remote - Israel'],
  Spain: ['Spain', 'Madrid', 'Barcelona', 'Remote - Spain'],
  Italy: ['Italy', 'Milan', 'Rome', 'Remote - Italy'],
  Sweden: ['Sweden', 'Stockholm', 'Remote - Sweden'],
  Poland: ['Poland', 'Warsaw', 'Krakow', 'Remote - Poland'],
  'United Arab Emirates': ['United Arab Emirates', 'UAE', 'Dubai', 'Abu Dhabi', 'Remote - UAE'],
};

/** Country → continent (coarse regions for Matches filter). */
export const COUNTRY_TO_CONTINENT = {
  'United States': 'North America',
  Canada: 'North America',
  Mexico: 'North America',
  Brazil: 'South America',
  'United Kingdom': 'Europe',
  Germany: 'Europe',
  France: 'Europe',
  Netherlands: 'Europe',
  Ireland: 'Europe',
  Switzerland: 'Europe',
  Spain: 'Europe',
  Italy: 'Europe',
  Sweden: 'Europe',
  Poland: 'Europe',
  India: 'Asia',
  China: 'Asia',
  Japan: 'Asia',
  Singapore: 'Asia',
  'South Korea': 'Asia',
  Israel: 'Asia',
  'United Arab Emirates': 'Asia',
  Australia: 'Oceania',
  'New Zealand': 'Oceania',
};

export const KNOWN_COUNTRIES = Object.keys(COUNTRY_LOCATION_ALIASES).sort();

export function getContinentForCountry(country) {
  if (!country) return null;
  if (COUNTRY_TO_CONTINENT[country]) return COUNTRY_TO_CONTINENT[country];
  // Fuzzy: try case-insensitive key match
  const key = Object.keys(COUNTRY_TO_CONTINENT).find(
    (c) => c.toLowerCase() === String(country).toLowerCase(),
  );
  return key ? COUNTRY_TO_CONTINENT[key] : null;
}

export function countriesInContinent(continent) {
  if (!continent) return [];
  return Object.entries(COUNTRY_TO_CONTINENT)
    .filter(([, c]) => c === continent)
    .map(([country]) => country);
}

/**
 * Resolve alias patterns for a country (canonical or free-text name).
 */
export function patternsForCountry(country) {
  if (!country) return [];
  const exact = COUNTRY_LOCATION_ALIASES[country];
  if (exact) return exact;
  const key = Object.keys(COUNTRY_LOCATION_ALIASES).find(
    (c) => c.toLowerCase() === String(country).toLowerCase(),
  );
  if (key) return COUNTRY_LOCATION_ALIASES[key];
  return [country];
}

/**
 * True when job.location text indicates the given country.
 */
export function locationMatchesCountry(location, country) {
  if (!location || !country) return false;
  const loc = String(location).toLowerCase();
  return patternsForCountry(country).some((pattern) => loc.includes(String(pattern).toLowerCase()));
}

/**
 * True when job.location matches any country in the continent.
 */
export function locationMatchesContinent(location, continent) {
  if (!location || !continent) return false;
  return countriesInContinent(continent).some((country) => locationMatchesCountry(location, country));
}

/**
 * Infer best-effort country name from a free-text job location.
 */
export function inferCountryFromLocation(location) {
  if (!location) return null;
  for (const country of KNOWN_COUNTRIES) {
    if (locationMatchesCountry(location, country)) return country;
  }
  return null;
}

const COUNTRY_NAME_SET = new Set(KNOWN_COUNTRIES.map((c) => c.toLowerCase()));

/**
 * Extract a city-ish token from free text ("Bangalore, India", "India - Hyderabad").
 * Returns null for remote/worldwide or when the string is only a country name.
 */
export function extractCity(location) {
  if (!location) return null;
  const raw = String(location).trim();
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (/\b(remote|worldwide|anywhere|global)\b/.test(lower) && !/[,-]/.test(raw)) {
    return null;
  }

  // "Country - City" / "Remote - City"
  const dashParts = raw.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    const right = dashParts[dashParts.length - 1];
    if (right && !isCountryName(right) && !/^(remote|worldwide|anywhere)$/i.test(right)) {
      return normalizeCity(right.split(',')[0]);
    }
  }

  // "City, Region, Country" → first segment if not a country
  const commaParts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  if (commaParts.length >= 1) {
    const first = commaParts[0];
    if (first && !isCountryName(first) && !/^(remote|worldwide|anywhere)$/i.test(first)) {
      return normalizeCity(first);
    }
  }

  if (!isCountryName(raw)) return normalizeCity(raw);
  return null;
}

function isCountryName(value) {
  const v = String(value || '').toLowerCase().trim();
  if (COUNTRY_NAME_SET.has(v)) return true;
  return KNOWN_COUNTRIES.some((c) => c.toLowerCase() === v);
}

function normalizeCity(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Graduated geo fit for matching:
 * same city → 1.0, same country → 0.8, same continent → 0.25, else → 0
 */
export function scoreGeoProximity(jobLocation, userCity, userCountry) {
  if (!jobLocation) {
    return { score: 0, match: 'no_job_location', city: userCity, country: userCountry };
  }

  const loc = String(jobLocation);
  const locLower = loc.toLowerCase();
  const jobCountry = inferCountryFromLocation(loc);
  const jobCity = extractCity(loc);

  if (userCity) {
    const city = userCity.toLowerCase();
    if (locLower.includes(city) || (jobCity && jobCity.toLowerCase() === city)) {
      return {
        score: 1,
        match: 'same_city',
        city: userCity,
        country: userCountry || jobCountry,
        job_city: jobCity,
        job_country: jobCountry,
      };
    }
  }

  if (userCountry && locationMatchesCountry(loc, userCountry)) {
    return {
      score: 0.8,
      match: 'same_country',
      city: userCity,
      country: userCountry,
      job_city: jobCity,
      job_country: jobCountry || userCountry,
    };
  }

  const userContinent = getContinentForCountry(userCountry);
  const jobContinent = getContinentForCountry(jobCountry) || (
    // Infer continent from aliases even without canonical country
    userContinent && locationMatchesContinent(loc, userContinent) ? userContinent : null
  );

  if (userContinent && jobContinent && userContinent === jobContinent) {
    return {
      score: 0.25,
      match: 'same_continent',
      city: userCity,
      country: userCountry,
      continent: userContinent,
      job_city: jobCity,
      job_country: jobCountry,
    };
  }

  if (userContinent && locationMatchesContinent(loc, userContinent)) {
    return {
      score: 0.25,
      match: 'same_continent',
      city: userCity,
      country: userCountry,
      continent: userContinent,
      job_city: jobCity,
      job_country: jobCountry,
    };
  }

  return {
    score: 0,
    match: 'other_continent',
    city: userCity,
    country: userCountry,
    job_city: jobCity,
    job_country: jobCountry,
  };
}
