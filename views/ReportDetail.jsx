'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Alert from '@/components/Alert';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import Breadcrumbs from '@/components/Breadcrumbs';
import CompanyAvatar from '@/components/CompanyAvatar';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import Meta from '@/components/Meta';
import SectionHeader from '@/components/SectionHeader';
import { ChipGroup } from '@/components/Chip';
import { buildReportMetaItems, formatReportDate, formatSignal } from '@/lib/reports/presentation';

export default function ReportDetail() {
  const { id } = useParams();
  const router = useRouter();
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
  const topics = Array.isArray(report.topics) ? report.topics : [];
  const questions = Array.isArray(report.questions_asked) ? report.questions_asked : [];
  const metaItems = buildReportMetaItems(report);
  const dateLabel = formatReportDate(report.interview_date || report.created_at);

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
      <Breadcrumbs
        items={[
          { label: 'Experiences', to: '/reports' },
          { label: report.role_label || report.company },
        ]}
      />

      <Card padding="xl">
        <header style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
            <CompanyAvatar name={report.company} size={44} />
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {report.company}
            </p>
          </div>

          <h1 style={{ margin: 0, marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-3xl)', letterSpacing: 'var(--letter-spacing-tight)' }}>
            {report.role_label || 'Interview experience'}
          </h1>

          {/* Confidence is evidence-based, not a truth claim — make that explicit. */}
          <ConfidenceBadge
            confidence={confidence}
            tooltip="Confidence reflects the evidence available to Kazana for this report. It does not mean every detail has been independently verified."
          >
            {dateLabel && (
              <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                {dateLabel}
              </span>
            )}
          </ConfidenceBadge>

          {confidence.signals?.length > 0 && (
            <p className="text-caption" style={{ margin: 'var(--spacing-sm) 0 0', color: 'var(--text-muted)' }}>
              Signals: {confidence.signals.map(formatSignal).join(', ')}
            </p>
          )}

          <Meta items={metaItems} />
        </header>

        {topics.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-xl)' }}>
            <ChipGroup items={topics} max={8} tone="tech" />
          </div>
        )}

        {questions.length > 0 && (
          <section style={{ marginBottom: 'var(--spacing-xl)' }}>
            <SectionHeader title="Questions asked" />
            <ol style={{ margin: 0, paddingLeft: 'var(--spacing-lg)' }}>
              {questions.map((q, i) => (
                <li key={i} style={{ fontSize: 'var(--font-size-base)', marginBottom: 'var(--spacing-sm)', lineHeight: 'var(--line-height-normal)' }}>
                  {q}
                </li>
              ))}
            </ol>
          </section>
        )}

        {report.report_text && (
          <section>
            <SectionHeader title="The experience" />
            <p style={{ fontSize: 'var(--font-size-base)', lineHeight: 'var(--line-height-relaxed)', whiteSpace: 'pre-wrap', margin: 0 }}>
              {report.report_text}
            </p>
          </section>
        )}
      </Card>

      {/* Next steps — this page is where a submission lands, so the share
          action must remain reachable here. It previously existed only in the
          browse empty state, which disappears after the first contribution. */}
      <Card
        padding="xl"
        style={{
          marginTop: 'var(--spacing-xl)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--spacing-lg)',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-xs)' }}>
            Interviewed somewhere else?
          </h2>
          <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', margin: 0 }}>
            Every experience you add strengthens the interview knowledge base.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexShrink: 0, flexWrap: 'wrap' }}>
          <Button variant="secondary" onClick={() => router.push('/reports')}>
            Browse experiences
          </Button>
          <Button onClick={() => router.push('/share')}>
            Share another experience
          </Button>
        </div>
      </Card>
    </div>
  );
}
