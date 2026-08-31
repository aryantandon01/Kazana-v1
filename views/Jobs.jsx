'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { apiFetch } from '@/lib/api/client';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import EmptyState from '@/components/EmptyState';
import SkeletonLoader from '@/components/SkeletonLoader';
import PageHeader from '@/components/PageHeader';
import FilterPanel, { FilterField } from '@/components/FilterPanel';
import JobCard from '@/components/JobCard';
import { CAREER_AREAS } from '@/constants/careerAreas';
import { FRESHNESS_OPTIONS } from '@/lib/api/jobFilters';
import { useAuth } from '@/context/AuthContext';
import { scoreJobForUser } from '@/lib/matching/score';

const selectStyles = {
  control: (base) => ({
    ...base,
    borderColor: 'var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    minHeight: '40px',
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-sm)',
    boxShadow: 'none',
    backgroundColor: 'var(--bg-primary)',
    '&:hover': { borderColor: 'var(--border-color-strong)' },
  }),
  menu: (base) => ({ ...base, fontFamily: 'var(--font-family)', zIndex: 1000, fontSize: 'var(--font-size-sm)' }),
  option: (base, state) => ({
    ...base,
    fontSize: 'var(--font-size-sm)',
    backgroundColor: state.isSelected
      ? 'var(--color-primary-muted)'
      : state.isFocused
        ? 'var(--bg-tertiary)'
        : 'var(--bg-primary)',
    color: 'var(--text-primary)',
  }),
  multiValue: (base) => ({ ...base, backgroundColor: 'var(--color-primary-muted)', borderRadius: 4 }),
  multiValueLabel: (base) => ({ ...base, color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)' }),
  placeholder: (base) => ({ ...base, color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }),
  singleValue: (base) => ({ ...base, fontSize: 'var(--font-size-sm)' }),
  input: (base) => ({ ...base, fontSize: 'var(--font-size-sm)' }),
  indicatorSeparator: () => ({ display: 'none' }),
};

const SORT_OPTIONS = [
  { value: 'discovered_at:desc', label: 'Newly Discovered' },
  { value: 'last_updated_at:desc', label: 'Recently Updated' },
  { value: 'best_match:desc', label: 'Best Match' },
  { value: 'company_name:asc', label: 'Company A–Z' },
  { value: 'posted_at:desc', label: 'Employer Posted' },
];

const defaultFilters = {
  companies: [],
  careerAreas: [],
  countries: [],
  yearsMin: '',
  yearsMax: '',
  remoteOnly: false,
  freshness: FRESHNESS_OPTIONS.find((option) => option.value === 'all') || { value: 'all', label: 'All Time' },
};

function parseSortKey(sortKey) {
  const sep = String(sortKey || '').lastIndexOf(':');
  if (sep <= 0) return { field: 'discovered_at', direction: 'desc' };
  return {
    field: sortKey.slice(0, sep),
    direction: sortKey.slice(sep + 1) || 'desc',
  };
}

function buildJobsQuery({ page, limit, search, filters, sortKey }) {
  const sortBy = parseSortKey(sortKey);
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
    sort: sortBy.field,
    dir: sortBy.direction,
  });

  if (search.trim()) {
    // Ignore 1-char queries — too broad and historically timed out under load
    if (search.trim().length >= 2) params.set('q', search.trim());
  }
  if (filters.yearsMin) params.set('years_min', filters.yearsMin);
  if (filters.yearsMax) params.set('years_max', filters.yearsMax);
  if (filters.remoteOnly) params.set('remote', 'true');
  if (filters.freshness?.value && filters.freshness.value !== 'all') {
    params.set('freshness', filters.freshness.value);
  }
  filters.companies.forEach((company) => params.append('company', company.value));
  filters.countries.forEach((country) => params.append('country', country.value));
  filters.careerAreas.forEach((area) => params.append('career_area', area.value));

  return params.toString();
}

export default function Jobs() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [sortKey, setSortKey] = useState('discovered_at:desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [totalJobs, setTotalJobs] = useState(0);
  const [userResumes, setUserResumes] = useState([]);
  const [userProfile, setUserProfile] = useState(null);
  const itemsPerPage = 10;
  const fetchGenRef = useRef(0);

  useEffect(() => {
    const handle = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setCurrentPage(1);
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    const freshness = searchParams.get('freshness');
    const careerAreas = searchParams.getAll('career_area');
    const remote = searchParams.get('remote') === 'true';
    const sort = searchParams.get('sort');

    setFilters((prev) => {
      const nextFreshness =
        FRESHNESS_OPTIONS.find((option) => option.value === freshness) || prev.freshness;
      const nextCareerAreas = careerAreas.length
        ? CAREER_AREAS.filter((area) => careerAreas.includes(area.value))
        : prev.careerAreas;
      const nextRemoteOnly = remote || prev.remoteOnly;

      const sameFreshness = nextFreshness?.value === prev.freshness?.value;
      const sameCareer =
        nextCareerAreas.length === prev.careerAreas.length &&
        nextCareerAreas.every((area, i) => area.value === prev.careerAreas[i]?.value);
      const sameRemote = nextRemoteOnly === prev.remoteOnly;
      if (sameFreshness && sameCareer && sameRemote) return prev;

      return {
        ...prev,
        freshness: nextFreshness,
        careerAreas: nextCareerAreas,
        remoteOnly: nextRemoteOnly,
      };
    });

    if (sort === 'last_updated_at') {
      setSortKey((prev) => (prev === 'last_updated_at:desc' ? prev : 'last_updated_at:desc'));
    }
  }, [searchParams]);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 1024);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/jobs/visit', { method: 'POST' }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUserResumes([]);
      setUserProfile(null);
      return undefined;
    }

    let cancelled = false;

    async function loadMatchContext() {
      try {
        const [resumesRes, prefsRes] = await Promise.all([
          apiFetch('/api/resumes/mine'),
          apiFetch('/api/preferences'),
        ]);
        if (cancelled) return;
        setUserResumes(resumesRes.data || []);
        setUserProfile(prefsRes.data?.profile || null);
      } catch {
        if (!cancelled) {
          setUserResumes([]);
          setUserProfile(null);
        }
      }
    }

    loadMatchContext();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadCompanies = useCallback(async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/companies${q}`);
      return (data || []).map((company) => ({ value: company.name, label: company.name }));
    } catch {
      return [];
    }
  }, []);

  const loadCountries = useCallback(async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/countries${q}`);
      return (data || []).map((country) => ({ value: country.name, label: country.name }));
    } catch {
      return [];
    }
  }, []);

  const patchFilters = useCallback((updater) => {
    setFilters(updater);
    setCurrentPage(1);
  }, []);

  useEffect(() => {
    const gen = ++fetchGenRef.current;
    setLoading(true);
    setError(null);

    async function fetchJobs() {
      try {
        const query = buildJobsQuery({
          page: currentPage,
          limit: itemsPerPage,
          search: debouncedSearch,
          filters,
          sortKey,
        });
        const { data, meta } = await apiFetch(`/api/jobs?${query}`);
        if (gen !== fetchGenRef.current) return;
        setJobs(data || []);
        setTotalJobs(meta?.total ?? 0);
      } catch (err) {
        if (gen !== fetchGenRef.current) return;
        setError(err.message);
      } finally {
        if (gen === fetchGenRef.current) setLoading(false);
      }
    }

    fetchJobs();
  }, [currentPage, debouncedSearch, filters, sortKey]);

  const totalPages = Math.max(1, Math.ceil(totalJobs / itemsPerPage));

  const hasActiveFilters =
    filters.companies.length > 0 ||
    filters.careerAreas.length > 0 ||
    filters.countries.length > 0 ||
    filters.yearsMin !== '' ||
    filters.yearsMax !== '' ||
    filters.remoteOnly ||
    (filters.freshness && filters.freshness.value !== 'all') ||
    search !== '';

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setFilters(defaultFilters);
    setCurrentPage(1);
  };

  const handleSortChange = (option) => {
    if (!option?.value || option.value === sortKey) return;
    // Invalidate in-flight list requests so a slow older sort cannot overwrite this one.
    fetchGenRef.current += 1;
    setJobs([]);
    setTotalJobs(0);
    setCurrentPage(1);
    setSortKey(option.value);
    setLoading(true);
    setError(null);
  };

  const jobsWithMatch = useMemo(() => {
    return jobs.map((job) => {
      // Best Match API attaches the stored ranking score — use it so order and badges agree.
      if (job.match_score != null && !Number.isNaN(Number(job.match_score))) {
        const score = Number(job.match_score);
        return {
          job,
          match: {
            score,
            reasons: job.match_reasons || [],
            label: score >= 0.7 ? 'Strong match' : score >= 0.45 ? 'Match' : 'Low match',
          },
        };
      }

      if (!user || !userResumes.length) {
        return { job, match: null };
      }

      return {
        job,
        match: scoreJobForUser(job, userResumes, userProfile),
      };
    });
  }, [jobs, user, userResumes, userProfile]);

  const selectedSort = SORT_OPTIONS.find((option) => option.value === sortKey) || SORT_OPTIONS[0];

  return (
    <div
      className="container"
      style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)' }}
    >
      <PageHeader
        title="Jobs"
        description="Discover opportunities — not records. Freshness and fit first."
      />

      {error && (
        <Alert variant="error" style={{ marginBottom: 'var(--spacing-xl)' }}>
          {error}
        </Alert>
      )}

      <div
        style={{
          display: 'flex',
          gap: 'var(--spacing-2xl)',
          alignItems: 'flex-start',
          flexWrap: isMobile ? 'wrap' : 'nowrap',
        }}
      >
        <div style={{ width: isMobile ? '100%' : 'var(--sidebar-width)', flexShrink: 0 }}>
          <FilterPanel title="Browse" hasActiveFilters={hasActiveFilters} onClear={clearFilters}>
            <FilterField label="Search">
              <Input
                type="search"
                placeholder="Role, company, skill…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="Search jobs"
              />
            </FilterField>

            <FilterField label="Companies">
              <AsyncSelect
                instanceId="jobs-filter-companies"
                isMulti
                cacheOptions
                defaultOptions
                loadOptions={loadCompanies}
                value={filters.companies}
                onChange={(selected) => patchFilters((prev) => ({ ...prev, companies: selected || [] }))}
                placeholder="Any company"
                styles={selectStyles}
                isSearchable
              />
            </FilterField>

            <FilterField label="Career areas">
              <Select
                instanceId="jobs-filter-career-areas"
                isMulti
                options={CAREER_AREAS}
                value={filters.careerAreas}
                onChange={(selected) => patchFilters((prev) => ({ ...prev, careerAreas: selected || [] }))}
                isClearable
                placeholder="Any area"
                styles={selectStyles}
                isSearchable
              />
            </FilterField>

            <FilterField label="Location">
              <AsyncSelect
                instanceId="jobs-filter-countries"
                isMulti
                cacheOptions
                defaultOptions
                loadOptions={loadCountries}
                value={filters.countries}
                onChange={(selected) => patchFilters((prev) => ({ ...prev, countries: selected || [] }))}
                placeholder="Any country"
                styles={selectStyles}
                isSearchable
              />
            </FilterField>

            <FilterField label="Freshness">
              <Select
                instanceId="jobs-filter-freshness"
                options={FRESHNESS_OPTIONS}
                value={filters.freshness}
                onChange={(selected) =>
                  patchFilters((prev) => ({
                    ...prev,
                    freshness: selected || FRESHNESS_OPTIONS.find((option) => option.value === 'all'),
                  }))
                }
                styles={selectStyles}
                isSearchable={false}
              />
            </FilterField>

            <FilterField label="Experience years">
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.yearsMin}
                  onChange={(e) => patchFilters((prev) => ({ ...prev, yearsMin: e.target.value }))}
                  style={yearsInputStyle}
                  aria-label="Minimum years required"
                />
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' }}>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.yearsMax}
                  onChange={(e) => patchFilters((prev) => ({ ...prev, yearsMax: e.target.value }))}
                  style={yearsInputStyle}
                  aria-label="Maximum years required"
                />
              </div>
            </FilterField>

            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--spacing-sm)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={filters.remoteOnly}
                onChange={(e) => patchFilters((prev) => ({ ...prev, remoteOnly: e.target.checked }))}
              />
              Remote only
            </label>
          </FilterPanel>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 'var(--spacing-xl)',
              flexWrap: 'wrap',
              gap: 'var(--spacing-md)',
            }}
          >
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
              {loading && jobs.length === 0
                ? 'Loading…'
                : `${totalJobs.toLocaleString()} role${totalJobs !== 1 ? 's' : ''}`}
            </p>
            <div style={{ minWidth: '200px' }}>
              <Select
                instanceId="jobs-sort"
                options={SORT_OPTIONS}
                value={selectedSort}
                onChange={handleSortChange}
                styles={selectStyles}
                isSearchable={false}
                aria-label="Sort jobs"
              />
            </div>
          </div>

          {loading && jobs.length === 0 ? (
            <SkeletonLoader rows={4} variant="card" />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No jobs match"
              message={
                hasActiveFilters
                  ? 'Try widening freshness, career areas, or clearing filters.'
                  : 'No jobs in the database yet. Run ingestion to populate listings.'
              }
              action={hasActiveFilters ? <Button onClick={clearFilters}>Clear filters</Button> : null}
            />
          ) : (
            <div
              key={sortKey}
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-lg)',
                opacity: loading ? 0.55 : 1,
                transition: 'opacity 120ms ease',
              }}
              aria-busy={loading}
            >
              {jobsWithMatch.map(({ job, match }) => (
                <JobCard key={job.id} job={job} match={match} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              aria-label="Jobs pagination"
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 'var(--spacing-xs)',
                marginTop: 'var(--spacing-2xl)',
              }}
            >
              {renderPagination(currentPage, totalPages, setCurrentPage)}
            </nav>
          )}
        </div>
      </div>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          style={{
            position: 'fixed',
            bottom: 'var(--spacing-xl)',
            right: 'var(--spacing-xl)',
            width: '44px',
            height: '44px',
            borderRadius: 'var(--border-radius-full)',
            border: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-md)',
            zIndex: 'var(--z-sticky)',
            fontSize: 'var(--font-size-md)',
          }}
        >
          ↑
        </button>
      )}
    </div>
  );
}

const yearsInputStyle = {
  width: '72px',
  padding: '8px 10px',
  minHeight: '40px',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  fontSize: 'var(--font-size-sm)',
  fontFamily: 'var(--font-family)',
  backgroundColor: 'var(--bg-primary)',
  color: 'var(--text-primary)',
};

function renderPagination(currentPage, totalPages, setCurrentPage) {
  const btn = (active) => ({
    minWidth: '32px',
    height: '32px',
    padding: '0 8px',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    backgroundColor: active ? 'var(--color-primary)' : 'var(--bg-primary)',
    color: active ? 'var(--text-inverse)' : 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 'var(--font-size-xs)',
    fontFamily: 'inherit',
  });

  const getWindow = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const pages = getWindow();
  const showLast = totalPages > 5 && pages[pages.length - 1] < totalPages;

  return (
    <>
      <button
        type="button"
        onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
        disabled={currentPage === 1}
        aria-label="Previous page"
        style={{ ...btn(false), opacity: currentPage === 1 ? 0.45 : 1 }}
      >
        Prev
      </button>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => setCurrentPage(page)}
          aria-current={currentPage === page ? 'page' : undefined}
          style={btn(currentPage === page)}
        >
          {page}
        </button>
      ))}
      {showLast && (
        <>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>…</span>
          <button type="button" onClick={() => setCurrentPage(totalPages)} style={btn(currentPage === totalPages)}>
            Last
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        style={{ ...btn(false), opacity: currentPage === totalPages ? 0.45 : 1 }}
      >
        Next
      </button>
    </>
  );
}
