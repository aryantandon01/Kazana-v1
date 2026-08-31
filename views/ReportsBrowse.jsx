'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import EmptyState from '@/components/EmptyState';
import SkeletonLoader from '@/components/SkeletonLoader';
import PageHeader from '@/components/PageHeader';

const STAGE_OPTIONS = [
  { value: 'phone_screen', label: 'Phone Screen' },
  { value: 'technical', label: 'Technical Interview' },
  { value: 'system_design', label: 'System Design' },
  { value: 'behavioral', label: 'Behavioral Interview' },
  { value: 'onsite', label: 'Onsite' },
  { value: 'final', label: 'Final Round' },
];

const SORT_OPTIONS = [
  { value: 'confidence', label: 'Highest confidence' },
  { value: 'recent', label: 'Most recent' },
];

export default function ReportsBrowse() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('confidence');

  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ sort, limit: '50' });
      if (search.trim()) params.set('q', search.trim());
      const { data } = await apiFetch(`/api/reports?${params.toString()}`);
      setReports(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, sort]);

  useEffect(() => {
    const handle = setTimeout(() => fetchReports(), search.trim() ? 350 : 0);
    return () => clearTimeout(handle);
  }, [fetchReports, search]);

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)' }}>
      <PageHeader
        title="Interview Experiences"
        description="Real interview experiences, confidence-scored. Learn what companies ask and how candidates prepared."
      />

      {error && <Alert variant="error" style={{ marginBottom: 'var(--spacing-xl)' }}>{error}</Alert>}

      {/* Controls */}
      <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-xl)', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
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
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          aria-label="Sort reports"
          style={selectStyle}
        >
          {SORT_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <SkeletonLoader rows={4} variant="card" />
      ) : reports.length === 0 ? (
        <EmptyState
          title="No interview experiences yet"
          message="Be the first to share what a real interview was like — it helps calibrate everything we recommend."
          action={<Button onClick={() => window.location.href = '/share'}>Share your experience</Button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
          {reports.map((report) => (
            <ReportCard key={report.id} report={report} />
          ))}
        </div>
      )}
    </div>
  );
}

function ReportCard({ report }) {
  const confidence = report.confidence || {};
  const level = confidence.level === 'high' ? 'High confidence' : confidence.level === 'medium' ? 'Medium confidence' : 'Low confidence';
  const badgeColor =
    confidence.level === 'high'
      ? 'var(--color-success)'
      : confidence.level === 'medium'
        ? 'var(--color-warning)'
        : 'var(--text-muted)';

  const stageLabel = STAGE_OPTIONS.find((s) => s.value === report.stage)?.label || report.stage;

  return (
    <Card style={{ padding: 'var(--spacing-xl)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '220px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-xs)' }}>
            <a href={`/reports/${report.id}`} style={companyLinkStyle}>
              {report.company}
            </a>
            <span style={stageBadgeStyle}>{stageLabel}</span>
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              {report.role_label}
            </span>
          </div>

          {report.questions_asked?.length > 0 && (
            <div style={{ marginTop: 'var(--spacing-sm)' }}>
              <strong style={{ fontSize: 'var(--font-size-sm)' }}>Questions asked</strong>
              <ul style={{ margin: 'var(--spacing-xs) 0 0 var(--spacing-lg)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
                {report.questions_asked.slice(0, 3).map((q, i) => (
                  <li key={i} style={{ marginBottom: 'var(--spacing-2xs)' }}>{q}</li>
                ))}
                {report.questions_asked.length > 3 && (
                  <li style={{ color: 'var(--text-muted)' }}>+{report.questions_asked.length - 3} more</li>
                )}
              </ul>
            </div>
          )}

          {report.report_text && (
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginTop: 'var(--spacing-md)', lineHeight: 'var(--line-height-normal)' }}>
              {String(report.report_text).slice(0, 240)}
              {report.report_text.length > 240 ? '…' : ''}
            </p>
          )}

          <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)', flexWrap: 'wrap' }}>
            {report.difficulty != null && (
              <span style={metaStyle}>Difficulty: {report.difficulty}/5</span>
            )}
            {report.outcome && (
              <span style={metaStyle}>Outcome: {formatOutcome(report.outcome)}</span>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              color: badgeColor,
              backgroundColor: confidence.level === 'high' ? 'var(--color-success-muted)' : confidence.level === 'medium' ? 'var(--color-warning-muted)' : 'var(--bg-tertiary)',
              padding: '4px 10px',
              borderRadius: 'var(--border-radius-full)',
              whiteSpace: 'nowrap',
            }}
          >
            {level} · {Math.round((confidence.score || 0) * 100)}%
          </span>
          <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginTop: 'var(--spacing-xs)' }}>
            {formatDate(report.interview_date || report.created_at)}
          </p>
        </div>
      </div>
    </Card>
  );
}

const companyLinkStyle = {
  fontSize: 'var(--font-size-lg)',
  fontWeight: 'var(--font-weight-semibold)',
  color: 'var(--text-primary)',
  textDecoration: 'none',
};

const stageBadgeStyle = {
  fontSize: 'var(--font-size-xs)',
  textTransform: 'uppercase',
  letterSpacing: 'var(--letter-spacing-wide)',
  padding: '3px 8px',
  borderRadius: 'var(--border-radius-sm)',
  backgroundColor: 'var(--bg-tertiary)',
  color: 'var(--text-secondary)',
  fontWeight: 'var(--font-weight-medium)',
};

const metaStyle = {
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

function formatOutcome(outcome) {
  const map = { offer: 'Offer', advance: 'Advanced', reject: 'Rejected', no_response: 'No response' };
  return map[outcome] || outcome;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}