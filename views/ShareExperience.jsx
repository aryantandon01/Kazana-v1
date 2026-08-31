'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Select from 'react-select';
import AsyncSelect from 'react-select/async';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Input from '@/components/Input';
import Loading from '@/components/Loading';
import PageHeader from '@/components/PageHeader';
import { JOB_FAMILY_GROUPS, getJobFamilyByValue } from '@/constants/jobFamilies';

const STAGE_OPTIONS = [
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'technical', label: 'Technical Interview' },
  { value: 'system_design', label: 'System Design' },
  { value: 'behavioral', label: 'Behavioral Interview' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'final', label: 'Final Round' },
];

const OUTCOME_OPTIONS = [
  { value: 'offer', label: 'Offer received' },
  { value: 'advance', label: 'Advanced to next round' },
  { value: 'reject', label: 'Rejected' },
  { value: 'no_response', label: 'No response yet' },
];

const DIFFICULTY_OPTIONS = [1, 2, 3, 4, 5].map((d) => ({ value: d, label: `${d} — ${d <= 2 ? 'Easy' : d === 3 ? 'Moderate' : 'Hard'}` }));

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
    backgroundColor: state.isSelected ? 'var(--color-primary-muted)' : state.isFocused ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
    color: 'var(--text-primary)',
  }),
  multiValue: (base) => ({ ...base, backgroundColor: 'var(--color-primary-muted)', borderRadius: 4 }),
  multiValueLabel: (base) => ({ ...base, color: 'var(--color-primary)', fontSize: 'var(--font-size-xs)' }),
  placeholder: (base) => ({ ...base, color: 'var(--text-muted)', fontSize: 'var(--font-size-sm)' }),
  singleValue: (base) => ({ ...base, fontSize: 'var(--font-size-sm)' }),
  input: (base) => ({ ...base, fontSize: 'var(--font-size-sm)' }),
  indicatorSeparator: () => ({ display: 'none' }),
};

export default function ShareExperience() {
  const { user } = useAuth();
  const router = useRouter();
  const [company, setCompany] = useState(null);
  const [role, setRole] = useState(null);
  const [stage, setStage] = useState(null);
  const [questionsText, setQuestionsText] = useState('');
  const [topics, setTopics] = useState([]);
  const [difficulty, setDifficulty] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [interviewDate, setInterviewDate] = useState('');
  const [reportText, setReportText] = useState('');
  const [emailEvidence, setEmailEvidence] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadCompanies = useCallback(async (inputValue) => {
    try {
      const q = inputValue ? `?q=${encodeURIComponent(inputValue)}` : '';
      const { data } = await apiFetch(`/api/lookups/companies${q}`);
      return (data || []).map((c) => ({ value: c.name, label: c.name }));
    } catch {
      return [];
    }
  }, []);

  if (!user) {
    return <Loading message="Redirecting to login..." />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!company || !role || !stage) {
      setError('Company, role, and stage are required.');
      return;
    }

    const questionsAsked = questionsText
      .split('\n')
      .map((q) => q.trim())
      .filter(Boolean)
      .slice(0, 20);

    setSubmitting(true);
    setError(null);
    try {
      const { data } = await apiFetch('/api/reports', {
        method: 'POST',
        body: JSON.stringify({
          company: company.value,
          roleKey: role.value,
          roleLabel: role.label,
          stage: stage.value,
          questionsAsked,
          topics: topics.map((t) => t.value),
          difficulty: difficulty?.value || null,
          outcome: outcome?.value || null,
          interviewDate: interviewDate || null,
          reportText: reportText.trim() || '',
          emailEvidence: emailEvidence.trim() || '',
        }),
      });
      router.push(`/reports/${data.id}`);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
      <PageHeader
        title="Share Interview Experience"
        description="Contribute to the ground truth that calibrates Kazana's assessments. Reports are confidence-scored — never treated as absolute truth."
      />

      {error && <Alert variant="error" style={{ marginBottom: 'var(--spacing-xl)' }}>{error}</Alert>}

      <Card style={{ padding: 'var(--spacing-2xl)' }}>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
            <div>
              <label style={labelStyle}>Company *</label>
              <AsyncSelect
                instanceId="share-company"
                cacheOptions
                defaultOptions
                loadOptions={loadCompanies}
                value={company}
                onChange={setCompany}
                placeholder="Search companies..."
                styles={selectStyles}
                isSearchable
              />
            </div>
            <div>
              <label style={labelStyle}>Role *</label>
              <Select
                instanceId="share-role"
                options={JOB_FAMILY_GROUPS}
                value={role ? getJobFamilyByValue(role.value) : null}
                onChange={(selected) => setRole(selected)}
                placeholder="Select job family"
                styles={selectStyles}
                isSearchable
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
            <div>
              <label style={labelStyle}>Stage *</label>
              <Select
                instanceId="share-stage"
                options={STAGE_OPTIONS}
                value={stage}
                onChange={setStage}
                placeholder="Select stage"
                styles={selectStyles}
                isSearchable={false}
              />
            </div>
            <div>
              <label style={labelStyle}>Difficulty</label>
              <Select
                instanceId="share-difficulty"
                options={DIFFICULTY_OPTIONS}
                value={difficulty}
                onChange={setDifficulty}
                placeholder="Select difficulty"
                styles={selectStyles}
                isSearchable={false}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-lg)' }}>
            <div>
              <label style={labelStyle}>Outcome</label>
              <Select
                instanceId="share-outcome"
                options={OUTCOME_OPTIONS}
                value={outcome}
                onChange={setOutcome}
                placeholder="Select outcome"
                styles={selectStyles}
                isSearchable={false}
              />
            </div>
            <div>
              <label style={labelStyle}>Interview date</label>
              <Input type="date" value={interviewDate} onChange={(e) => setInterviewDate(e.target.value)} />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={labelStyle}>Questions asked (one per line)</label>
            <textarea
              value={questionsText}
              onChange={(e) => setQuestionsText(e.target.value)}
              rows={5}
              placeholder={`e.g.\nTell me about a time you led a project through ambiguity.\nHow would you design X at scale?`}
              style={textareaStyle}
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={labelStyle}>Topics / subject areas</label>
            <Select
              instanceId="share-topics"
              isMulti
              isClearable
              options={TOPIC_OPTIONS}
              value={topics}
              onChange={setTopics}
              placeholder="Select topics (e.g. System Design, Algorithms, Product Sense)"
              styles={selectStyles}
              isSearchable
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={labelStyle}>Describe the experience</label>
            <textarea
              value={reportText}
              onChange={(e) => setReportText(e.target.value)}
              rows={8}
              placeholder="What was the interview structure? How did you prepare? What surprised you? What advice would you give someone preparing for this?"
              style={textareaStyle}
            />
          </div>

          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <label style={labelStyle}>Email evidence (optional)</label>
            <Input
              value={emailEvidence}
              onChange={(e) => setEmailEvidence(e.target.value)}
              placeholder="Paste the interview invitation or outcome email subject/content"
            />
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 'var(--spacing-xs)' }}>
              Only a hash is stored — never the email itself. Providing evidence raises your report's confidence score.
            </p>
          </div>

          <Button type="submit" disabled={submitting}>
            {submitting ? 'Submitting…' : 'Submit report'}
          </Button>
        </form>
      </Card>

      <Card style={{ padding: 'var(--spacing-lg)', marginTop: 'var(--spacing-xl)', backgroundColor: 'var(--bg-secondary)' }}>
        <h3 style={{ fontSize: 'var(--font-size-base)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--spacing-sm)' }}>
          How confidence works
        </h3>
        <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 'var(--line-height-normal)' }}>
          Your report starts at 40% confidence and rises with email evidence, corroborating reports for the same company and role, contributor reputation, timeline consistency, and level of detail. Reports are inputs to a learning system — never labeled "verified".
        </p>
      </Card>
    </div>
  );
}

const TOPIC_OPTIONS = [
  'Algorithms', 'Data Structures', 'System Design', 'Distributed Systems', 'Machine Learning',
  'Product Sense', 'Behavioral', 'Leadership', 'SQL', 'Coding', 'Debugging', 'API Design',
  'Frontend', 'Backend', 'Cloud', 'Security', 'Design', 'Communication',
].map((t) => ({ value: t.toLowerCase().replace(/\s+/g, '_'), label: t }));

const labelStyle = {
  display: 'block',
  marginBottom: 'var(--spacing-xs)',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--text-secondary)',
};

const textareaStyle = {
  width: '100%',
  boxSizing: 'border-box',
  padding: 'var(--spacing-md)',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--border-radius-sm)',
  fontSize: 'var(--font-size-base)',
  fontFamily: 'var(--font-family)',
  lineHeight: 'var(--line-height-normal)',
  resize: 'vertical',
};