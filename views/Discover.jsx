'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { apiFetch } from '@/lib/api/client';
import PDFModal from '@/components/PDFModal';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import SkeletonLoader from '@/components/SkeletonLoader';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { useAuth } from '@/context/AuthContext';
import { getJobFamilyByValue, JOB_FAMILY_GROUPS, ALL_JOB_FAMILIES } from '@/constants/jobFamilies';
import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';

const DISCOVER_COLLECTIONS = [
  {
    label: 'Trending AI companies',
    hint: 'OpenAI, Anthropic, Google, Google DeepMind',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setFilters((prev) => ({
        ...prev,
        companies: ['OpenAI', 'Anthropic', 'Google', 'Google DeepMind'].map((name) => ({ value: name, label: name })),
      }));
      setCurrentPage(1);
    },
  },
  {
    label: 'Developer tools',
    hint: 'Stripe, Vercel, GitHub, Databricks',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setFilters((prev) => ({
        ...prev,
        companies: ['Stripe', 'Vercel', 'GitHub', 'Databricks'].map((name) => ({ value: name, label: name })),
      }));
      setCurrentPage(1);
    },
  },
  {
    label: 'Remote friendly',
    hint: 'Resumes with remote or worldwide locations',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setFilters((prev) => ({ ...prev, countries: [{ value: 'United States', label: 'United States' }] }));
      setCurrentPage(1);
    },
  },
  {
    label: 'New graduate friendly',
    hint: 'L1–L3 entry paths',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setFilters((prev) => ({
        ...prev,
        level: levelOptions.find((option) => option.value === 'L2') || null,
      }));
      setCurrentPage(1);
    },
  },
  {
    label: 'Recently added',
    hint: 'Newest resumes first',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setSortBy({ field: 'created_at', direction: 'desc' });
      setCurrentPage(1);
    },
  },
  {
    label: 'Fast movers',
    hint: 'Senior IC profiles',
    apply: (setFilters, setSortBy, setCurrentPage) => {
      setFilters((prev) => ({
        ...prev,
        level: levelOptions.find((option) => option.value === 'L5') || null,
      }));
      setCurrentPage(1);
    },
  },
];

const levelOptions = [
  { value: 'L1', label: 'L1' },
  { value: 'L2', label: 'L2' },
  { value: 'L3', label: 'L3' },
  { value: 'L4', label: 'L4' },
  { value: 'L5', label: 'L5' },
  { value: 'L6', label: 'L6' },
  { value: 'L7', label: 'L7' },
  { value: 'L8', label: 'L8' },
  { value: 'L9', label: 'L9' }
];

const filterHeadingFontSize = 'var(--font-size-xs)';
const placeholderFontSize = 'var(--font-size-xs)';

const selectStyles = {
  control: (base) => ({
    ...base,
    borderColor: 'var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '2px',
    fontFamily: 'var(--font-family)',
    fontSize: placeholderFontSize,
    minHeight: '34px',
    '&:hover': {
      borderColor: 'var(--color-primary)',
    },
  }),
  menu: (base) => ({
    ...base,
    fontFamily: 'var(--font-family)',
    zIndex: 1000,
  }),
  option: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
  }),
  singleValue: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--color-primary-light)',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'var(--color-primary)',
    fontSize: placeholderFontSize,
  }),
  placeholder: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
    color: 'var(--text-muted)',
  }),
  input: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
  }),
};

const sortSelectStyles = {
  ...selectStyles,
  control: (base) => ({
    ...selectStyles.control(base),
    minHeight: '32px',
  }),
  option: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
  }),
  singleValue: (base) => ({
    ...base,
    fontSize: placeholderFontSize,
  }),
};

// Component to display companies with "+X" format and hover tooltip
function CompaniesDisplay({ firstCompany, remainingCount, remainingCompanies }) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--spacing-xs)' }}>
      {firstCompany}
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '28px',
          height: '20px',
          padding: '0 var(--spacing-xs)',
          backgroundColor: 'var(--color-primary-light)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--border-radius-sm)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          cursor: 'help',
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        +{remainingCount}
      </span>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 'var(--spacing-xs)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            backgroundColor: 'var(--color-gray-900)',
            color: 'var(--text-inverse)',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 'var(--font-size-sm)',
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
          }}
        >
          {remainingCompanies.join(', ')}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 'var(--spacing-md)',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid var(--color-gray-900)',
            }}
          />
        </div>
      )}
    </span>
  );
}

export default function Discover() {
  const [resumes, setResumes] = useState([]);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [selectedFileUrl, setSelectedFileUrl] = useState('');
  const [selectedResume, setSelectedResume] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [sortBy, setSortBy] = useState({ field: 'created_at', direction: 'desc' });
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showBackToTop, setShowBackToTop] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Filter states
  const [filters, setFilters] = useState({
    companies: [],
    jobFamily: null,
    level: null,
    countries: [],
    yearsMin: '',
    yearsMax: '',
    university: null,
  });

  useEffect(() => {
    async function fetchResumes() {
      setLoading(true);
      setError(null);
      try {
        // Discover filters client-side, so load every page (API default is 20).
        const pageSize = 100;
        let page = 1;
        let total = Infinity;
        const all = [];

        while (all.length < total) {
          const { data, meta } = await apiFetch(
            `/api/resumes?page=${page}&limit=${pageSize}`,
          );
          all.push(...(data || []));
          total = meta?.total ?? all.length;
          if (!data?.length || data.length < pageSize) break;
          page += 1;
        }

        setResumes(all);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching resumes:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchResumes();
  }, []);

    const loadCompanies = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/companies${q}`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch { return []; }
  };

  const loadCountries = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/countries${q}`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch { return []; }
  };

  const loadUniversities = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/universities${q}`);
      return (data || []).map((u) => ({
        value: u.name,
        label: u.country ? `${u.name} (${u.country})` : u.name,
      }));
    } catch { return []; }
  };


  // Apply filters, search, and sorting
  const filteredAndSortedResumes = useMemo(() => {
    let filtered = resumes.filter(resume => {
      // Text search - enhanced to search specific fields (excluding private name field)
      if (search) {
        const searchLower = search.toLowerCase();
        const searchableFields = [
          resume.job_family,
          resume.level,
          resume.country,
          resume.university,
          resume.years_of_experience || resume.years,
          ...(resume.companies && Array.isArray(resume.companies) ? resume.companies : resume.company ? [resume.company] : [])
        ].filter(Boolean).map(f => String(f).toLowerCase());
        
        const matchesSearch = searchableFields.some(field => field.includes(searchLower));
        if (!matchesSearch) return false;
      }

      // Company filter - check if any selected company is in resume's companies array
      if (filters.companies.length > 0) {
        const selectedCompanyValues = filters.companies.map(c => c.value);
        const resumeCompanies = resume.companies && Array.isArray(resume.companies) 
          ? resume.companies 
          : (resume.company ? [resume.company] : []);
        const hasMatchingCompany = selectedCompanyValues.some(filterCompany => 
          resumeCompanies.includes(filterCompany)
        );
        if (!hasMatchingCompany) {
          return false;
        }
      }

      // Job Family filter
      if (filters.jobFamily && resume.job_family !== filters.jobFamily.value) {
        return false;
      }

      // Level filter
      if (filters.level && resume.level !== filters.level.value) {
        return false;
      }

      // Country filter
      if (filters.countries.length > 0) {
        const selectedCountryValues = filters.countries.map(c => c.value);
        if (!selectedCountryValues.includes(resume.country)) {
          return false;
        }
      }

      // Years of experience filter
      const years = resume.years_of_experience || resume.years;
      if (filters.yearsMin && (years === null || years < parseInt(filters.yearsMin))) {
        return false;
      }
      if (filters.yearsMax && (years === null || years > parseInt(filters.yearsMax))) {
        return false;
      }

      // University filter
      if (filters.university && resume.university !== filters.university.value) {
        return false;
      }

      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (sortBy.field) {
        case 'years_of_experience':
          aValue = a.years_of_experience || a.years || 0;
          bValue = b.years_of_experience || b.years || 0;
          break;
        case 'job_family':
          aValue = getJobFamilyByValue(a.job_family)?.label || a.job_family || '';
          bValue = getJobFamilyByValue(b.job_family)?.label || b.job_family || '';
          break;
        case 'level':
          aValue = a.level || '';
          bValue = b.level || '';
          break;
        case 'created_at':
        default:
          aValue = a.created_at || '';
          bValue = b.created_at || '';
          break;
      }

      if (sortBy.field === 'years_of_experience') {
        return sortBy.direction === 'asc' ? aValue - bValue : bValue - aValue;
      } else {
        if (aValue < bValue) return sortBy.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortBy.direction === 'asc' ? 1 : -1;
        return 0;
      }
    });

    return filtered;
  }, [resumes, search, filters, sortBy]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedResumes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResumes = filteredAndSortedResumes.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filters]);

  const filteredResumes = filteredAndSortedResumes; // Keep for count display

  const clearFilters = () => {
    setFilters({
      companies: [],
      jobFamily: null,
      level: null,
      countries: [],
      yearsMin: '',
      yearsMax: '',
      university: null,
    });
    setSearch('');
  };

  const hasActiveFilters = filters.companies.length > 0 ||
    filters.jobFamily !== null ||
    filters.level !== null ||
    filters.countries.length > 0 ||
    filters.yearsMin !== '' ||
    filters.yearsMax !== '' ||
    filters.university !== null ||
    search !== '';

  if (loading) {
    return (
      <div className="container" style={{ 
        paddingTop: 'var(--spacing-3xl)',
        paddingBottom: 'var(--spacing-3xl)',
      }}>
        <PageHeader
          title="Discover"
          description="Explore resumes that cleared ATS screens — collections first, then the full vault."
        />
        <SkeletonLoader rows={5} variant="card" />
      </div>
    );
  }

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'var(--bg-primary)',
    borderRadius: 'var(--border-radius-lg)',
    overflow: 'hidden',
    border: '1px solid var(--border-color)',
  };

  const thStyle = {
    padding: 'var(--spacing-md) var(--spacing-lg)',
    textAlign: 'left',
    backgroundColor: 'var(--bg-tertiary)',
    fontWeight: 'var(--font-weight-medium)',
    fontSize: 'var(--font-size-xs)',
    color: 'var(--text-muted)',
    letterSpacing: 'var(--letter-spacing-wide)',
    textTransform: 'uppercase',
    borderBottom: '1px solid var(--border-color)',
  };

  const tdStyle = {
    padding: 'var(--spacing-lg)',
    borderBottom: '1px solid var(--border-subtle)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--text-primary)',
    textAlign: 'left',
  };

  const getRowStyle = (index) => ({
    ...tdStyle,
    backgroundColor: index % 2 === 0 ? 'var(--bg-primary)' : 'var(--color-gray-50)',
  });

  const rowStyle = {
    cursor: 'pointer',
    transition: 'background-color var(--transition-fast)',
  };

  const sidebarStyle = {
    width: '280px',
    minWidth: '280px',
    paddingRight: 'var(--spacing-lg)',
    position: 'sticky',
    top: 'var(--spacing-xl)',
    alignSelf: 'flex-start',
    maxHeight: 'calc(100vh - var(--spacing-xl) * 2)',
    overflowY: 'auto',
  };

  const filterSectionStyle = {
    marginBottom: 'var(--spacing-lg)',
  };

  const filterLabelStyle = {
    fontSize: filterHeadingFontSize,
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--text-primary)',
    marginBottom: 'var(--spacing-sm)',
    display: 'block',
  };


  return (
    <div className="container" style={{ 
      paddingTop: 'var(--spacing-3xl)',
      paddingBottom: 'var(--spacing-3xl)',
    }}>
      <PageHeader
        title="Discover"
        description="Explore resumes that cleared ATS screens — collections first, then the full vault."
      />

      <section style={{ marginBottom: 'var(--spacing-2xl)' }}>
        <SectionHeader title="Collections" description="Editorial lenses — pick a theme and explore." />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--spacing-md)',
          }}
        >
          {DISCOVER_COLLECTIONS.map((collection) => (
            <button
              key={collection.label}
              type="button"
              onClick={() => collection.apply(setFilters, setSortBy, setCurrentPage)}
              style={{
                textAlign: 'left',
                padding: 'var(--spacing-lg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--border-radius-lg)',
                backgroundColor: 'var(--bg-primary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                e.currentTarget.style.borderColor = 'var(--border-color-strong)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                e.currentTarget.style.borderColor = 'var(--border-color)';
              }}
            >
              <p style={{ margin: 0, fontSize: 'var(--font-size-md)', fontWeight: 600, color: 'var(--text-primary)' }}>
                {collection.label}
              </p>
              <p style={{ margin: 'var(--spacing-xs) 0 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                {collection.hint}
              </p>
            </button>
          ))}
        </div>
      </section>

      <div style={{ 
        display: 'flex', 
        marginBottom: 'var(--spacing-xl)',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 'var(--spacing-md)',
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--spacing-md)',
          flexWrap: 'wrap',
          marginLeft: 'auto',
        }}>
          <div style={{ 
            fontSize: 'var(--font-size-sm)', 
            color: 'var(--text-muted)',
          }}>
            {filteredResumes.length} {filteredResumes.length === 1 ? 'resume' : 'resumes'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)' }}>
            <label style={{ 
              fontSize: 'var(--font-size-xs)', 
              color: 'var(--text-secondary)',
              whiteSpace: 'nowrap',
            }}>
              Sort by:
            </label>
            <Select
              value={{
                value: `${sortBy.field}_${sortBy.direction}`,
                label: sortBy.field === 'years_of_experience' ? 'Years of Experience' :
                       sortBy.field === 'job_family' ? 'Job Family' :
                       sortBy.field === 'level' ? 'Level' : 'Date Added'
              }}
              onChange={(selected) => {
                const [field, direction] = selected.value.split('_');
                setSortBy({ field, direction });
                setCurrentPage(1);
              }}
              options={[
                { value: 'created_at_desc', label: 'Date Added (Newest)' },
                { value: 'created_at_asc', label: 'Date Added (Oldest)' },
                { value: 'years_of_experience_desc', label: 'Years of Experience (High to Low)' },
                { value: 'years_of_experience_asc', label: 'Years of Experience (Low to High)' },
                { value: 'job_family_asc', label: 'Job Family (A-Z)' },
                { value: 'job_family_desc', label: 'Job Family (Z-A)' },
                { value: 'level_asc', label: 'Level (L1-L9)' },
                { value: 'level_desc', label: 'Level (L9-L1)' },
              ]}
              styles={sortSelectStyles}
              isSearchable={false}
            />
          </div>
        </div>
      </div>
      
      {error && <Alert variant="error">{error}</Alert>}

      <div style={{ 
        display: 'flex', 
        gap: 'var(--spacing-lg)', 
        alignItems: 'flex-start',
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        {/* Filter Sidebar */}
        <aside style={{
          ...sidebarStyle,
          width: isMobile ? '100%' : sidebarStyle.width,
          minWidth: isMobile ? '100%' : sidebarStyle.minWidth,
          position: isMobile ? 'relative' : sidebarStyle.position,
          top: isMobile ? 'auto' : sidebarStyle.top,
          paddingRight: isMobile ? 0 : sidebarStyle.paddingRight,
        }}>
          <Card padding="lg">
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 'var(--spacing-lg)',
            }}>
              <h3 style={{
                margin: 0,
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                letterSpacing: 'var(--letter-spacing-wide)',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>Filters</h3>
              {hasActiveFilters && (
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={clearFilters}
                  style={{ fontSize: 'var(--font-size-xs)' }}
                >
                  Clear All
                </Button>
              )}
            </div>

            {/* Search */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Search</label>
              <Input
                type="text"
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  fontSize: placeholderFontSize,
                  minHeight: '34px',
                  padding: '6px 8px',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Company Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Companies</label>
              <AsyncSelect
                isMulti
                cacheOptions
                defaultOptions
                loadOptions={loadCompanies}
                value={filters.companies}
                onChange={(selected) => {
                  setFilters(prev => ({ ...prev, companies: selected || [] }));
                }}
                placeholder="Search companies..."
                styles={selectStyles}
                isSearchable
                noOptionsMessage={({ inputValue }) => 
                  inputValue ? `No companies found matching "${inputValue}"` : 'Type to search companies...'
                }
              />
            </div>

            {/* Job Family Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Job Family</label>
              <Select
                options={JOB_FAMILY_GROUPS}
                value={filters.jobFamily}
                onChange={(selected) => {
                  setFilters(prev => ({ ...prev, jobFamily: selected }));
                }}
                placeholder="Select job family..."
                styles={selectStyles}
                isSearchable
                isClearable
                noOptionsMessage={() => 'No job families found'}
              />
            </div>

            {/* Level Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Level</label>
              <Select
                options={levelOptions}
                value={filters.level}
                onChange={(selected) => {
                  setFilters(prev => ({ ...prev, level: selected }));
                }}
                placeholder="Level (L1, L2, etc.)"
                styles={selectStyles}
                isClearable
              />
            </div>

            {/* Years of Experience Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Years of Experience</label>
              <div style={{ display: 'flex', gap: 'var(--spacing-sm)', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.yearsMin}
                  onChange={(e) => setFilters(prev => ({ ...prev, yearsMin: e.target.value }))}
                  style={{
                    width: '80px',
                    padding: 'var(--spacing-sm)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius-sm)',
                    fontSize: placeholderFontSize,
                    fontFamily: 'var(--font-family)',
                  }}
                />
                <span style={{ color: 'var(--text-muted)', fontSize: placeholderFontSize }}>to</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.yearsMax}
                  onChange={(e) => setFilters(prev => ({ ...prev, yearsMax: e.target.value }))}
                  style={{
                    width: '80px',
                    padding: 'var(--spacing-sm)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--border-radius-sm)',
                    fontSize: placeholderFontSize,
                    fontFamily: 'var(--font-family)',
                  }}
                />
              </div>
            </div>

            {/* Country Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>Country</label>
              <AsyncSelect
                isMulti
                cacheOptions
                defaultOptions
                loadOptions={loadCountries}
                value={filters.countries}
                onChange={(selected) => {
                  setFilters(prev => ({ ...prev, countries: selected || [] }));
                }}
                placeholder="Search countries..."
                styles={selectStyles}
                isSearchable
                noOptionsMessage={({ inputValue }) => 
                  inputValue ? `No countries found matching "${inputValue}"` : 'Type to search countries...'
                }
              />
            </div>

            {/* University Filter */}
            <div style={filterSectionStyle}>
              <label style={filterLabelStyle}>University</label>
              <AsyncSelect
                cacheOptions
                defaultOptions
                loadOptions={loadUniversities}
                value={filters.university}
                onChange={(selected) => {
                  setFilters(prev => ({ ...prev, university: selected }));
                }}
                placeholder="Search universities..."
                styles={selectStyles}
                isSearchable
                isClearable
                noOptionsMessage={({ inputValue }) => 
                  inputValue ? `No universities found matching "${inputValue}"` : 'Type to search universities...'
                }
              />
            </div>
          </Card>
        </aside>

        {/* Main Content - Table */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {filteredResumes.length === 0 ? (
            <EmptyState
              title="No resumes found"
              message={hasActiveFilters ? "Try adjusting your filters" : "No resumes have been uploaded yet"}
              action={
                hasActiveFilters ? (
                  <Button onClick={clearFilters}>Clear Filters</Button>
                ) : user ? (
                  <Link href="/add-resume">
                    <Button>Be the first to add a resume</Button>
                  </Link>
                ) : null
              }
            />
          ) : (
            <Card padding="none" style={{ overflowX: 'auto' }}>
              <table style={tableStyle} aria-label="Discover resumes - companies, job family, and experience">
                <thead>
                  <tr>
                    <th style={thStyle} scope="col">Companies</th>
                    <th style={thStyle} scope="col">Job Family</th>
                    <th style={thStyle} scope="col">Years of Experience</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedResumes.map((resume, index) => (
                    <tr
                      key={resume.id}
                      onClick={() => {
                        if (resume.file_url && resume.file_url.trim() !== '') {
                          setSelectedFileUrl(resume.file_url);
                          setSelectedResume(resume);
                          setShowModal(true);
                        }
                      }}
                      style={{
                        ...getRowStyle(index),
                        cursor: resume.file_url ? 'pointer' : 'default',
                      }}
                      onMouseEnter={(e) => {
                        if (resume.file_url) {
                          e.currentTarget.style.backgroundColor = 'var(--color-gray-100)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = getRowStyle(index).backgroundColor;
                      }}
                    >
                        <td style={tdStyle}>
                          {(() => {
                            const companies = resume.companies && Array.isArray(resume.companies) 
                              ? resume.companies 
                              : (resume.company ? [resume.company] : []);
                            
                            if (companies.length === 0) {
                              return '-';
                            }
                            
                            if (companies.length === 1) {
                              return companies[0];
                            }
                            
                            // Show first company + "+X" format with hover tooltip
                            const firstCompany = companies[0];
                            const remainingCount = companies.length - 1;
                            const remainingCompanies = companies.slice(1);
                            
                            return (
                              <CompaniesDisplay 
                                firstCompany={firstCompany}
                                remainingCount={remainingCount}
                                remainingCompanies={remainingCompanies}
                              />
                            );
                          })()}
                        </td>
                        <td style={tdStyle}>{getJobFamilyByValue(resume.job_family)?.label || resume.job_family || '-'}</td>
                        <td style={tdStyle}>{resume.years_of_experience || resume.years || '-'}</td>
                      </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (() => {
            const getPageWindow = () => {
              if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
              if (currentPage <= 3) return [1, 2, 3, 4, 5];
              if (currentPage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
              return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
            };
            const pageNumbers = getPageWindow();
            const showLast = totalPages > 5 && pageNumbers[pageNumbers.length - 1] < totalPages;
            const paginationBtnStyle = (active) => ({
              minWidth: '28px',
              height: '28px',
              padding: '0 var(--spacing-xs)',
              fontSize: 'var(--font-size-xs)',
              fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--border-radius-sm)',
              border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-color)'}`,
              background: active ? 'var(--color-primary)' : 'var(--bg-primary)',
              color: active ? 'var(--text-inverse)' : 'var(--text-primary)',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'all var(--transition-fast)',
            });
            return (
              <div style={{
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'center',
                gap: 'var(--spacing-xs)',
                marginTop: 'var(--spacing-lg)',
                flexWrap: 'wrap',
              }}>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous page"
                  style={{
                    ...paginationBtnStyle(false),
                    cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                    opacity: currentPage === 1 ? 0.5 : 1,
                  }}
                >
                  Prev
                </button>
                {pageNumbers.map((pageNum) => (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    style={paginationBtnStyle(currentPage === pageNum)}
                    aria-current={currentPage === pageNum ? 'page' : undefined}
                  >
                    {pageNum}
                  </button>
                ))}
                {showLast && (
                  <>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', padding: '0 var(--spacing-xs)' }}>…</span>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(totalPages)}
                      aria-label="Last page"
                      style={paginationBtnStyle(currentPage === totalPages)}
                    >
                      Last
                    </button>
                  </>
                )}
                <span style={{
                  fontSize: 'var(--font-size-xs)',
                  color: 'var(--text-muted)',
                  marginLeft: 'var(--spacing-sm)',
                }}>
                  {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  aria-label="Next page"
                  style={{
                    ...paginationBtnStyle(false),
                    cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                    opacity: currentPage === totalPages ? 0.5 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            );
          })()}
        </div>
      </div>

      {showModal && (
        <PDFModal
          isOpen={showModal}
          fileUrl={selectedFileUrl}
          resumeData={selectedResume}
          onClose={() => {
            setShowModal(false);
            setSelectedResume(null);
          }}
        />  
      )}

      {showBackToTop && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          style={{
            position: 'fixed',
            bottom: 'var(--spacing-lg)',
            right: 'var(--spacing-lg)',
            zIndex: 'var(--z-fixed)',
          }}
        >
          Back to top
        </Button>
      )}
    </div>
  );
}
