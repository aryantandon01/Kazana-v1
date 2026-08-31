'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import PageHeader from '@/components/PageHeader';

const STAGE_LABELS = {
  phone_screen: 'Phone Screen',
  technical: 'Technical Interview',
  system_design: 'System Design',
  behavioral: 'Behavioral Interview',
  onsite: 'Onsite',
  final: 'Final Round',
};

export default function ReportDetail() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(`/api/reports/${id}`)
      .then(({ data }) => setReport(data))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <Loading message="Loading report..." />;

  if (error || !report) {
    return (
      <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
        <Alert variant="error">{error || 'Report not found'}</Alert>
      </div>
    );
  }

  const confidence = report.confidence || {};
  const levelLabel =
    confidence.level === 'high'
      ? 'High confidence'
      : confidence.level === 'medium'
        ? 'Medium confidence'
        : 'Low confidence';

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
      <PageHeader
        title={`${report.company} · ${report.role_label}`}
        description={STAGE_LABELS[report.stage] || report.stage}
      />

      {/* Confidence badge */}
      <Card style={{ padding: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: confidence.level === 'high' ? 'var(--color-success)' : confidence.level === 'medium' ? 'var(--color-warning)' : 'var(--text-muted)',
            backgroundColor: confidence.level === 'high' ? 'var(--color-success-muted)' : confidence.level === 'medium' ? 'var(--color-warning-muted)' : 'var(--bg-tertiary)',
            padding: '6px 12px',
            borderRadius: 'var(--border-radius-full)',
          }}
        >
          {levelLabel} · {Math.round((confidence.score || 0) * 100)}%
        </span>
        {confidence.signals?.length > 0 && (
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Signals: {confidence.signals.join(', ')}
          </span>
        )}
        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {formatDate(report.interview_date || report.created_at)}
        </span>
      </Card>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 'var(--spacing-lg)', marginBottom: 'var(--spacing-xl)', flexWrap: 'wrap' }}>
        {report.difficulty != null && (
          <span style={metaStyle}>Difficulty: {report.difficulty}/5</span>
        )}
        {report.outcome && (
          <span style={metaStyle}>Outcome: {formatOutcome(report.outcome)}</span>
        )}
        {report.topics?.length > 0 && (
          <span style={metaStyle}>Topics: {report.topics.join(', ')}</span>
        )}
      </div>

      {/* Questions */}
      {report.questions_asked?.length > 0 && (
        <Card style={{ padding: 'var(--spacing-xl)', marginBottom: 'var(--spacing-xl)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>Questions asked</h2>
          <ol style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
            {report.questions_asked.map((q, i) => (
              <li key={i} style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)', lineHeight: 'var(--line-height-normal)' }}>
                {q}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Full report text */}
      {report.report_text && (
        <Card style={{ padding: 'var(--spacing-xl)' }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>The experience</h2>
          <p style={{ fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-relaxed)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {report.report_text}
          </p>
        </Card>
      )}
    </div>
  );
}

const metaStyle = {
  fontSize: 'var(--font-size-sm)',
  color: 'var(--text-secondary)',
};

function formatOutcome(outcome) {
  const map = { offer: 'Offer received', advance: 'Advanced to next round', reject: 'Rejected', no_response: 'No response yet' };
  return map[outcome] || outcome;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
}