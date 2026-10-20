'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { apiFetch } from '@/lib/api/client';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import EmptyState from '@/components/EmptyState';
import SkeletonLoader from '@/components/SkeletonLoader';
import PageHeader from '@/components/PageHeader';
import Pagination from '@/components/Pagination';
import ReportCard from '@/components/ReportCard';
import { REPORT_LEVEL_OPTIONS } from '@/constants/reportLevels';

const SORT_OPTIONS = [
  { value: 'confidence', label: 'Highest confidence' },
  { value: 'recent', label: 'Most recent' },
];

/** Experiences per page. The API clamps `limit` to 50. */
const PAGE_SIZE = 10;

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

export default function ReportsBrowse() {
  const router = useRouter();
  const [reports, setReports] = useState([]);
  const [total, setTotal] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState(null);
  const [country, setCountry] = useState(null);
  const [sort, setSort] = useState('confidence');

  const loadCountries = useCallback(async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/countries${q}`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch {
      return [];
    }
  }, []);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort,
        page: String(currentPage),
        limit: String(PAGE_SIZE),
      });
      if (search.trim()) params.set('q', search.trim());
      if (level) params.set('level', level.value);
      if (country) params.set('country', country.value);
      const { data, meta } = await apiFetch(`/api/reports?${params.toString()}`);
      setReports(data || []);
      setTotal(meta?.total ?? 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, sort, currentPage, level, country]);

  useEffect(() => {
    const handle = setTimeout(() => fetchReports(), search.trim() ? 350 : 0);
    return () => clearTimeout(handle);
  }, [fetchReports, search]);

  // A narrowed search can strand us past the last page — fall back to page 1.
  useEffect(() => {
    if (!loading && reports.length === 0 && currentPage > 1) setCurrentPage(1);
  }, [loading, reports.length, currentPage]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(search.trim()) || Boolean(level) || Boolean(country);

  const clearFilters = () => {
    setSearch('');
    setLevel(null);
    setCountry(null);
    setCurrentPage(1);
  };

  // Page changes should not leave the reader scrolled into the middle of the list.
  const goToPage = (next) => {
    setCurrentPage(next);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)' }}>
      <PageHeader
        title="Interview Experiences"
        description="Real interview experiences, confidence-scored. Learn what companies ask and how candidates prepared."
        // Persistent action: the share entry point must not vanish once reports exist.
        actions={<Button onClick={() => router.push('/share')}>Share your experience</Button>}
      />

      {error && <Alert variant="error" style={{ marginBottom: 'var(--spacing-xl)' }}>{error}</Alert>}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setCurrentPage(1);
          }}
          placeholder="Search company, role, topic…"
          aria-label="Search interview reports"
          style={{
            flex: 1,
            minWidth: '220px',
            padding: '10px 14px',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 'var(--font-size-base)',
            fontFamily: 'var(--font-family)',
          }}
        />
        <div style={{ minWidth: '140px' }}>
          <Select
            instanceId="reports-level"
            options={REPORT_LEVEL_OPTIONS}
            value={level}
            onChange={(selected) => {
              setLevel(selected);
              setCurrentPage(1);
            }}
            placeholder="Level"
            isClearable
            isSearchable={false}
            styles={selectStyles}
          />
        </div>
        <div style={{ minWidth: '200px' }}>
          <AsyncSelect
            instanceId="reports-country"
            cacheOptions
            defaultOptions
            loadOptions={loadCountries}
            value={country}
            onChange={(selected) => {
              setCountry(selected);
              setCurrentPage(1);
            }}
            placeholder="Country"
            isClearable
            styles={selectStyles}
          />
        </div>
        <select
          value={sort}
          onChange={(e) => {
            setSort(e.target.value);
            setCurrentPage(1);
          }}
          aria-label="Sort reports"
          style={selectStyle}
        >
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonLoader rows={3} variant="card" />
      ) : reports.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No experiences match"
            message="Nothing matches these filters. Try a different company, role, level, or country."
            action={<Button variant="secondary" onClick={clearFilters}>Clear filters</Button>}
          />
        ) : (
          <EmptyState
            title="No interview experiences yet"
            message="Be the first to share what a real interview was like — it helps other candidates know what to expect."
            action={<Button onClick={() => router.push('/share')}>Share your experience</Button>}
          />
        )
      ) : (
        <>
          <p style={resultCountStyle} aria-live="polite">
            {total} experience{total === 1 ? '' : 's'}
            {totalPages > 1 ? ` · page ${currentPage} of ${totalPages}` : ''}
          </p>

          {/* Keyed so the fade-in replays when the page or filter changes. */}
          <div
            key={`${sort}-${search}-${level?.value || ''}-${country?.value || ''}-${currentPage}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-lg)',
              opacity: loading ? 0.55 : 1,
              transition: 'opacity 120ms ease',
            }}
            aria-busy={loading}
          >
            {reports.map((report) => (
              <ReportCard key={report.id} report={report} />
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onChange={goToPage}
            label="Experiences pagination"
          />
        </>
      )}
    </div>
  );
}

const resultCountStyle = {
  margin: '0 0 var(--spacing-lg)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--text-muted)',
};

const selectStyle = {
  padding: '10px 14px',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  fontSize: 'var(--font-size-base)',
  fontFamily: 'var(--font-family)',
  backgroundColor: 'var(--bg-primary)',
};
