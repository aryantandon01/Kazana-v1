'use client';

import React, { useState, useEffect } from 'react';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import Toast from '@/components/Toast';
import Tooltip from '@/components/Tooltip';
import Breadcrumbs from '@/components/Breadcrumbs';
import { JOB_FAMILY_GROUPS, ALL_JOB_FAMILIES } from '@/constants/jobFamilies';

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

function fileNameFromUrl(url) {
  if (!url) return 'Current resume.pdf';
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    const base = path.split('/').filter(Boolean).pop() || 'resume.pdf';
    // Storage keys look like: userId/1234567890-My_Resume.pdf
    return base.replace(/^\d+-/, '') || base;
  } catch {
    return 'Current resume.pdf';
  }
}

const selectStyles = {
  control: (base) => ({
    ...base,
    borderColor: 'var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    padding: '2px',
    fontFamily: 'var(--font-family)',
    fontSize: 'var(--font-size-base)',
    minHeight: '38px',
    '&:hover': {
      borderColor: 'var(--color-primary)',
    },
  }),
  menu: (base) => ({
    ...base,
    fontFamily: 'var(--font-family)',
    zIndex: 1000,
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'var(--color-primary-light)',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'var(--color-primary)',
  }),
};

export default function EditResume() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  const [companies, setCompanies] = useState([]);
  const [jobFamily, setJobFamily] = useState(null);
  const [level, setLevel] = useState(null);
  const [years, setYears] = useState('');
  const [country, setCountry] = useState(null);
  const [university, setUniversity] = useState(null);
  const [name, setName] = useState('');
  const [file, setFile] = useState(null);
  const [existingFileUrl, setExistingFileUrl] = useState(null);
  const [existingFileName, setExistingFileName] = useState(null);

  const loadCompanies = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/companies${q}`);
      return (data || []).map((company) => ({ value: company.name, label: company.name }));
    } catch (err) {
      console.error('Error fetching companies:', err);
      return [];
    }
  };

  const loadCountries = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/countries${q}`);
      return (data || []).map((country) => ({ value: country.name, label: country.name }));
    } catch (err) {
      console.error('Error fetching countries:', err);
      return [];
    }
  };

  const loadUniversities = async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/universities${q}`);
      return (data || []).map((university) => ({ value: university.name, label: university.name }));
    } catch (err) {
      console.error('Error fetching universities:', err);
      return [];
    }
  };

  useEffect(() => {
    const fetchResume = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, meta } = await apiFetch(`/api/resumes/${id}`);
        if (!meta?.isOwner) {
          throw new Error('You do not have permission to edit this resume');
        }

        if (data) {
          // Handle both old company field and new companies array
          const companiesData = data.companies || (data.company ? [data.company] : []);
          const selectedCompanies = companiesData
            .map(companyName => ({ value: companyName, label: companyName }));
          setCompanies(selectedCompanies);
          
          // Find job family in the new structure, or create a fallback option
          const foundJobFamily = ALL_JOB_FAMILIES.find(opt => opt.value === data.job_family);
          setJobFamily(foundJobFamily || { value: data.job_family, label: data.job_family });
          setLevel(levelOptions.find(opt => opt.value === data.level) || { value: data.level, label: data.level });
          setYears(data.years_of_experience || data.years || '');
          setCountry(data.country ? { value: data.country, label: data.country } : null);
          setUniversity(data.university ? { value: data.university, label: data.university } : null);
          setName(data.name || '');
          setExistingFileUrl(data.file_url || null);
          setExistingFileName(fileNameFromUrl(data.file_url));
          setFile(null);
        }
      } catch (err) {
        setError(err.message);
        console.error('Error fetching resume:', err);
      } finally {
        setLoading(false);
      }
    };

    if (!user) {
      router.push('/login');
      return;
    }
    fetchResume();
  }, [id, user, router]);

  const validateForm = () => {
    const errors = {};
    
    if (companies.length === 0) {
      errors.companies = "Please select at least one company";
    }
    
    if (!jobFamily) {
      errors.jobFamily = "Please select a job family";
    }
    
    if (!level) {
      errors.level = "Please select a level";
    }
    
    const yearsStr = String(years || '').trim();
    if (!yearsStr || yearsStr === '') {
      errors.years = "Please enter years of experience";
    } else if (isNaN(parseInt(yearsStr)) || parseInt(yearsStr) < 0) {
      errors.years = "Please enter a valid number (0 or greater)";
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setValidationErrors({});
    
    if (!validateForm()) {
      setError("Please fix the errors in the form");
      return;
    }

    setSaving(true);

    try {

      const companiesArray = companies.map(company => company.value);

      const updateData = {
        companies: companiesArray,
        job_family: jobFamily?.value,
        level: level?.value,
        years_of_experience: years ? parseInt(years) : null,
        country: country ? country.value : '',
        university: university ? university.value : null,
        name: name.trim() || null,
      };

      if (file) {
        const { data: uploadData } = await apiFetch('/api/resumes/upload-url', {
          method: 'POST',
          body: JSON.stringify({ filename: file.name, contentType: file.type || 'application/pdf' }),
        });

        const uploadResponse = await fetch(uploadData.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/pdf' },
          body: file,
        });

        if (!uploadResponse.ok) {
          throw new Error('File upload failed');
        }

        updateData.file_url = uploadData.publicUrl;
      }

      await apiFetch(`/api/resumes/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updateData),
      });

      setToast({ message: 'Resume updated successfully!', variant: 'success' });
      setTimeout(() => {
        router.push('/resume-manager');
      }, 1500);
    } catch (err) {
      setError(err.message);
      console.error('Error updating resume:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="Loading resume..." />;
  }

  return (
    <div className="container" style={{ 
      maxWidth: 'var(--container-md)',
      paddingTop: 'var(--spacing-xl)',
      paddingBottom: 'var(--spacing-xl)',
    }}>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'My Resumes', to: '/resume-manager' },
          { label: 'Edit' },
        ]}
      />
      <Card padding="xl">
        <h2 style={{ marginBottom: 'var(--spacing-lg)' }}>Edit Details</h2>
        
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--spacing-xs)',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Companies (that accepted this resume) <span style={{ color: 'var(--color-error)' }}>*</span>
              <Tooltip 
                content="Select all companies where this resume passed their ATS (Applicant Tracking System) or resume screening process. This helps others understand which companies found this resume format effective."
                position="bottom"
              >
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--color-primary-light)',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--font-size-xs)',
                  fontWeight: 'var(--font-weight-bold)',
                  cursor: 'help',
                }}>
                  ?
                </span>
              </Tooltip>
            </label>
            <AsyncSelect
              isMulti
              cacheOptions
              defaultOptions
              loadOptions={loadCompanies}
              value={companies}
              onChange={(selected) => {
                setCompanies(selected);
                if (validationErrors.companies) {
                  setValidationErrors(prev => ({ ...prev, companies: null }));
                }
              }}
              placeholder="Type to search companies (e.g., 'a' for Amazon, Apple...)"
              styles={{
                ...selectStyles,
                control: (base, state) => ({
                  ...selectStyles.control(base, state),
                  borderColor: validationErrors.companies ? 'var(--color-error)' : base.borderColor,
                }),
              }}
              isDisabled={saving}
              isSearchable
              noOptionsMessage={({ inputValue }) => 
                inputValue ? `No companies found matching "${inputValue}"` : 'Type to search companies...'
              }
            />
            {validationErrors.companies && (
              <p style={{ 
                marginTop: 'var(--spacing-xs)', 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-error)' 
              }}>
                {validationErrors.companies}
              </p>
            )}
            <p style={{ 
              marginTop: validationErrors.companies ? '0' : 'var(--spacing-xs)', 
              fontSize: 'var(--font-size-xs)', 
              color: 'var(--text-muted)' 
            }}>
              Select all companies where this resume passed ATS/resume screening. Start typing to search.
            </p>
          </div>

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Job Family <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <Select 
              options={JOB_FAMILY_GROUPS} 
              value={jobFamily} 
              onChange={(selected) => {
                setJobFamily(selected);
                if (validationErrors.jobFamily) {
                  setValidationErrors(prev => ({ ...prev, jobFamily: null }));
                }
              }}
              placeholder="Select job family..."
              styles={{
                ...selectStyles,
                control: (base, state) => ({
                  ...selectStyles.control(base, state),
                  borderColor: validationErrors.jobFamily ? 'var(--color-error)' : base.borderColor,
                }),
              }}
              isSearchable
              noOptionsMessage={() => 'No job families found'}
            />
            {validationErrors.jobFamily && (
              <p style={{ 
                marginTop: 'var(--spacing-xs)', 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-error)' 
              }}>
                {validationErrors.jobFamily}
              </p>
            )}
          </div>


          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Level <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <Select 
              options={levelOptions} 
              value={level} 
              onChange={setLevel} 
              placeholder="Level (L1, L2, etc.)"
              styles={selectStyles}
            />
          </div>

          <Input
            label="Years of Experience *"
            type="number"
            value={years}
            onChange={(e) => {
              setYears(e.target.value);
              if (validationErrors.years) {
                setValidationErrors(prev => ({ ...prev, years: null }));
              }
            }}
            placeholder="Years of Experience (0 in case you're a new grad)"
            error={validationErrors.years}
          />

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Country
            </label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              loadOptions={loadCountries}
              value={country}
              onChange={setCountry}
              placeholder="Type to search countries..."
              styles={selectStyles}
              isDisabled={saving}
              isSearchable
              noOptionsMessage={({ inputValue }) => 
                inputValue ? `No countries found matching "${inputValue}"` : 'Type to search countries...'
              }
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              University
            </label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              loadOptions={loadUniversities}
              value={university}
              onChange={setUniversity}
              placeholder="Type to search universities (e.g., 'm' for MIT, 's' for Stanford...)"
              styles={selectStyles}
              isDisabled={saving}
              isSearchable
              isClearable
              noOptionsMessage={({ inputValue }) => 
                inputValue ? `No universities found matching "${inputValue}"` : 'Type to search universities...'
              }
            />
            <p style={{ 
              marginTop: 'var(--spacing-xs)', 
              fontSize: 'var(--font-size-xs)', 
              color: 'var(--text-muted)' 
            }}>
              Optional: Select your university
            </p>
          </div>

          <Input
            name="name"
            label="Resume Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Data Engineering Resume, Backend Resume"
            disabled={saving}
          />
          <p style={{ 
            marginTop: 'calc(-1 * var(--spacing-md))',
            marginBottom: 'var(--spacing-md)',
            fontSize: 'var(--font-size-xs)', 
            color: 'var(--text-muted)' 
          }}>
            Optional: Give your resume a name to help you identify it
          </p>

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Resume file (PDF)
            </label>

            {existingFileUrl && !file && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--spacing-sm)',
                  width: '100%',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  marginBottom: 'var(--spacing-sm)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--border-radius)',
                  backgroundColor: 'var(--bg-secondary, var(--bg-primary))',
                }}
              >
                <span style={{ fontSize: '1.25rem' }} aria-hidden>📄</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{
                    margin: 0,
                    fontSize: 'var(--font-size-base)',
                    fontWeight: 'var(--font-weight-medium)',
                    color: 'var(--text-primary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {existingFileName || 'Current resume.pdf'}
                  </p>
                  <p style={{
                    margin: 0,
                    marginTop: 2,
                    fontSize: 'var(--font-size-xs)',
                    color: 'var(--text-muted)',
                  }}>
                    Current file — kept unless you replace it
                  </p>
                </div>
                <a
                  href={existingFileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-primary)',
                    fontWeight: 'var(--font-weight-medium)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  View
                </a>
                <span style={{
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-success)',
                  fontWeight: 'var(--font-weight-bold)',
                }}>
                  ✓
                </span>
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                id="file-input-edit"
                style={{
                  position: 'absolute',
                  width: '0.1px',
                  height: '0.1px',
                  opacity: 0,
                  overflow: 'hidden',
                  zIndex: -1,
                }}
              />
              <label
                htmlFor="file-input-edit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--spacing-sm)',
                  width: '100%',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  border: '2px dashed var(--border-color)',
                  borderRadius: 'var(--border-radius)',
                  backgroundColor: 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                  fontSize: 'var(--font-size-base)',
                  fontFamily: 'var(--font-family)',
                  fontWeight: 'var(--font-weight-medium)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  transition: 'all var(--transition-base)',
                  opacity: saving ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--color-primary-light)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  }
                }}
              >
                <span style={{ fontSize: '1.25rem' }} aria-hidden>📄</span>
                <span>
                  {file
                    ? file.name
                    : existingFileUrl
                      ? 'Replace PDF (optional)'
                      : 'Choose PDF file or drag and drop'}
                </span>
                {file && (
                  <span style={{
                    marginLeft: 'auto',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    fontWeight: 'var(--font-weight-bold)',
                  }}>
                    ✓
                  </span>
                )}
              </label>
            </div>
            {file ? (
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  const input = document.getElementById('file-input-edit');
                  if (input) input.value = '';
                }}
                disabled={saving}
                style={{
                  marginTop: 'var(--spacing-xs)',
                  padding: 0,
                  border: 'none',
                  background: 'none',
                  color: 'var(--color-primary)',
                  fontSize: 'var(--font-size-sm)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                Keep current file instead
              </button>
            ) : (
              <p style={{
                marginTop: 'var(--spacing-xs)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--text-muted)',
              }}>
                {existingFileUrl
                  ? 'Your existing PDF stays attached. Only choose a file if you want to replace it.'
                  : 'Upload a PDF resume file.'}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
            <Button 
              type="button" 
              variant="outline"
              onClick={() => router.push('/resume-manager')}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              variant="outline"
              fullWidth
              disabled={saving}
            >
              {saving ? 'Updating...' : 'Update Resume'}
            </Button>
          </div>
        </form>
      </Card>
      
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
