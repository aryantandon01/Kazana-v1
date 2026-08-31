'use client';

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import Toast from '@/components/Toast';
import Tooltip from '@/components/Tooltip';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { JOB_FAMILY_GROUPS, ALL_JOB_FAMILIES } from '@/constants/jobFamilies';

function safeNextPath(value) {
  if (!value || typeof value !== 'string') return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

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

export default function AddResume() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const nextPath = safeNextPath(searchParams.get('next')) || '/resume-manager';

  const [form, setForm] = useState({
    companies: [],
    job_family: "",
    level: "",
    years_of_experience: "",
    country: null,
    university: null,
    name: "",
    file: null,
  });

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [toast, setToast] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});

  useEffect(() => {
    if (!user) {
      router.push("/login");
    }
  }, [user, router]);

  if (!user) return <Loading />;

  const handleChange = (e) => {
    const { name, value, files } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: files ? files[0] : value,
    }));
  };

  const handleCompaniesChange = (selectedOptions) => {
    setForm((prev) => ({
      ...prev,
      companies: selectedOptions || [],
    }));
  };

  const loadCompanies = async (inputValue) => {
    setLoadingCompanies(true);
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/companies${q}`);
      return (data || []).map((company) => ({ value: company.name, label: company.name }));
    } catch (err) {
      console.error('Error fetching companies:', err);
      return [];
    } finally {
      setLoadingCompanies(false);
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

  const validateForm = () => {
    const errors = {};
    
    if (form.companies.length === 0) {
      errors.companies = "Please select at least one company";
    }
    
    if (!form.job_family) {
      errors.job_family = "Please select a job family";
    }
    
    if (!form.level) {
      errors.level = "Please select a level";
    }
    
    if (!form.years_of_experience || form.years_of_experience.trim() === '') {
      errors.years_of_experience = "Please enter years of experience";
    } else if (isNaN(parseInt(form.years_of_experience)) || parseInt(form.years_of_experience) < 0) {
      errors.years_of_experience = "Please enter a valid number (0 or greater)";
    }

    if (!form.country || !String(form.country).trim()) {
      errors.country = "Please select a country";
    }
    
    if (!form.file) {
      errors.file = "Please select a PDF file";
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

    setUploading(true);

    try {
      const file = form.file;
      const companiesArray = form.companies.map((company) => company.value);

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

      await apiFetch('/api/resumes', {
        method: 'POST',
        body: JSON.stringify({
          companies: companiesArray,
          job_family: form.job_family,
          level: form.level,
          years_of_experience: parseInt(form.years_of_experience, 10),
          country: form.country || null,
          university: form.university ? form.university.value : null,
          name: form.name.trim() || undefined,
          file_url: uploadData.publicUrl,
          file_path: uploadData.path,
        }),
      });

      setToast({ message: 'Resume added successfully!', variant: 'success' });
      setTimeout(() => {
        router.push(nextPath);
      }, 1500);
    } catch (err) {
      setError(err.message);
      console.error("Error uploading resume:", err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container" style={{ 
      maxWidth: 'var(--container-md)',
      paddingTop: 'var(--spacing-xl)',
      paddingBottom: 'var(--spacing-xl)',
    }}>
      <Card padding="xl">
        <h2 style={{ marginBottom: 'var(--spacing-lg)' }}>Add Resume</h2>
        
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
              value={form.companies}
              onChange={handleCompaniesChange}
              placeholder="Type to search companies (e.g., 'a' for Amazon, Apple...)"
              styles={{
                ...selectStyles,
                control: (base, state) => ({
                  ...selectStyles.control(base, state),
                  borderColor: validationErrors.companies ? 'var(--color-error)' : base.borderColor,
                }),
              }}
              isDisabled={uploading}
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
              value={form.job_family ? ALL_JOB_FAMILIES.find(opt => opt.value === form.job_family) || { value: form.job_family, label: form.job_family } : null}
              onChange={(selected) => {
                setForm(prev => ({
                  ...prev,
                  job_family: selected ? selected.value : '',
                }));
                if (validationErrors.job_family) {
                  setValidationErrors(prev => ({ ...prev, job_family: null }));
                }
              }}
              placeholder="Select job family..."
              styles={{
                ...selectStyles,
                control: (base, state) => ({
                  ...selectStyles.control(base, state),
                  borderColor: validationErrors.job_family ? 'var(--color-error)' : base.borderColor,
                }),
              }}
              isDisabled={uploading}
              isSearchable
              noOptionsMessage={() => 'No job families found'}
            />
            {validationErrors.job_family && (
              <p style={{ 
                marginTop: 'var(--spacing-xs)', 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-error)' 
              }}>
                {validationErrors.job_family}
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
              value={form.level ? levelOptions.find(opt => opt.value === form.level) || { value: form.level, label: form.level } : null}
              onChange={(selected) => {
                setForm(prev => ({
                  ...prev,
                  level: selected ? selected.value : '',
                }));
                if (validationErrors.level) {
                  setValidationErrors(prev => ({ ...prev, level: null }));
                }
              }}
              placeholder="Level (L1, L2, etc.)"
              styles={{
                ...selectStyles,
                control: (base, state) => ({
                  ...selectStyles.control(base, state),
                  borderColor: validationErrors.level ? 'var(--color-error)' : base.borderColor,
                }),
              }}
              isDisabled={uploading}
            />
            {validationErrors.level && (
              <p style={{ 
                marginTop: 'var(--spacing-xs)', 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-error)' 
              }}>
                {validationErrors.level}
              </p>
            )}
          </div>

          <Input
            name="years_of_experience"
            label="Years of Experience *"
            value={form.years_of_experience}
            onChange={(e) => {
              handleChange(e);
              if (validationErrors.years_of_experience) {
                setValidationErrors(prev => ({ ...prev, years_of_experience: null }));
              }
            }}
            placeholder="Years of Experience (0 in case you're a new grad)"
            required
            disabled={uploading}
            error={validationErrors.years_of_experience}
          />

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Country *
            </label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              loadOptions={loadCountries}
              value={form.country ? { value: form.country, label: form.country } : null}
              onChange={(selected) => {
                setForm(prev => ({
                  ...prev,
                  country: selected ? selected.value : '',
                }));
                if (validationErrors.country) {
                  setValidationErrors(prev => ({ ...prev, country: null }));
                }
              }}
              placeholder="Type to search countries..."
              styles={selectStyles}
              isDisabled={uploading}
              isSearchable
              isClearable
              noOptionsMessage={({ inputValue }) => 
                inputValue ? `No countries found matching "${inputValue}"` : 'Type to search countries...'
              }
            />
            {validationErrors.country && (
              <p style={{
                marginTop: 'var(--spacing-xs)',
                fontSize: 'var(--font-size-sm)',
                color: 'var(--color-error)',
              }}>
                {validationErrors.country}
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
              University
            </label>
            <AsyncSelect
              cacheOptions
              defaultOptions
              loadOptions={loadUniversities}
              value={form.university}
              onChange={(selected) => {
                setForm(prev => ({
                  ...prev,
                  university: selected,
                }));
              }}
              placeholder="Type to search universities (e.g., 'm' for MIT, 's' for Stanford...)"
              styles={selectStyles}
              isDisabled={uploading}
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
            value={form.name}
            onChange={handleChange}
            placeholder="e.g., Data Engineering Resume, Backend Resume (optional)"
            disabled={uploading}
          />
          <p style={{ 
            marginTop: 'calc(-1 * var(--spacing-md))',
            marginBottom: 'var(--spacing-md)',
            fontSize: 'var(--font-size-xs)', 
            color: 'var(--text-muted)' 
          }}>
            Optional: Give your resume a name. If left blank, it will be named "Resume 1", "Resume 2", etc.
          </p>

          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{
              display: 'block',
              marginBottom: 'var(--spacing-xs)',
              fontSize: 'var(--font-size-sm)',
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
            }}>
              Resume File (PDF) <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="file"
                name="file"
                accept=".pdf"
                onChange={(e) => {
                  handleChange(e);
                  if (validationErrors.file) {
                    setValidationErrors(prev => ({ ...prev, file: null }));
                  }
                }}
                required
                disabled={uploading}
                id="file-input"
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
                htmlFor="file-input"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--spacing-sm)',
                  width: '100%',
                  padding: 'var(--spacing-md) var(--spacing-lg)',
                  border: `2px dashed ${validationErrors.file ? 'var(--color-error)' : 'var(--border-color)'}`,
                  borderRadius: 'var(--border-radius)',
                  backgroundColor: validationErrors.file ? 'var(--color-error-bg)' : 'var(--bg-primary)',
                  color: validationErrors.file ? 'var(--color-error)' : 'var(--text-primary)',
                  fontSize: 'var(--font-size-base)',
                  fontFamily: 'var(--font-family)',
                  fontWeight: 'var(--font-weight-medium)',
                  cursor: uploading ? 'not-allowed' : 'pointer',
                  transition: 'all var(--transition-base)',
                  opacity: uploading ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!uploading && !validationErrors.file) {
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                    e.currentTarget.style.backgroundColor = 'var(--color-primary-light)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!uploading && !validationErrors.file) {
                    e.currentTarget.style.borderColor = 'var(--border-color)';
                    e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                  }
                }}
              >
                <span style={{ fontSize: '1.25rem' }}>📄</span>
                <span>
                  {form.file ? form.file.name : 'Choose PDF file or drag and drop'}
                </span>
                {form.file && (
                  <span style={{ 
                    marginLeft: 'auto',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-success)',
                    fontWeight: 'var(--font-weight-bold)'
                  }}>
                    ✓
                  </span>
                )}
              </label>
            </div>
            {validationErrors.file && (
              <p style={{ 
                marginTop: 'var(--spacing-xs)', 
                fontSize: 'var(--font-size-xs)', 
                color: 'var(--color-error)' 
              }}>
                {validationErrors.file}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
            <Button
              type="submit"
              variant="outline"
              fullWidth
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Submit Resume'}
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
