'use client';

import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/Button';
import CompanyAvatar from '@/components/CompanyAvatar';
import ConfidenceBadge from '@/components/ConfidenceBadge';
import Meta from '@/components/Meta';
import { ChipGroup } from '@/components/Chip';
import { buildReportMetaItems, formatReportDate } from '@/lib/reports/presentation';

/**
 * Experience card — scan order mirrors JobCard:
 * Company → Role → Confidence → Questions → Topics → Meta → Read
 *
 * The write-up body is deliberately withheld: the card is a scannable index and
 * "Read report" is the payoff. The full `report_text` lives on the detail page.
 */
export default function ReportCard({ report }) {
  const [hovered, setHovered] = useState(false);

  const confidence = report.confidence || {};
  const metaItems = buildReportMetaItems(report);

  const questions = Array.isArray(report.questions_asked) ? report.questions_asked : [];
  const topics = Array.isArray(report.topics) ? report.topics : [];

  return (
    <article
      className="fade-in report-card"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? 'var(--border-color-strong)' : 'var(--border-color)'}`,
        borderRadius: 'var(--border-radius-lg)',
        padding: 'var(--spacing-xl) var(--spacing-xl) var(--spacing-lg)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--spacing-lg)',
        transition: 'border-color var(--transition-fast), background-color var(--transition-fast)',
        backgroundColor: hovered ? 'var(--bg-elevated)' : 'var(--bg-primary)',
      }}
    >
      {/* 1. Company */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', minWidth: 0 }}>
        <CompanyAvatar name={report.company} size={36} />
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
          }}
        >
          {report.company}
        </p>
      </div>

      {/* 2. Role */}
      <Link
        href={`/reports/${report.id}`}
        style={{
          display: 'block',
          color: 'var(--text-primary)',
          textDecoration: 'none',
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          letterSpacing: 'var(--letter-spacing-tight)',
          lineHeight: 'var(--line-height-snug)',
          marginTop: '-4px',
        }}
      >
        {report.role_label || 'Interview experience'}
      </Link>

      {/* 3. Confidence + date — signature, first-class */}
      <ConfidenceBadge confidence={confidence}>
        {report.interview_date && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            · {formatReportDate(report.interview_date)}
          </span>
        )}
      </ConfidenceBadge>

      {/* 4. Questions asked */}
      {questions.length > 0 && (
        <ul
          style={{
            margin: 0,
            paddingLeft: 'var(--spacing-lg)',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--line-height-normal)',
          }}
        >
          {questions.slice(0, 3).map((q, i) => (
            <li key={i} style={{ marginBottom: 'var(--spacing-2xs)' }}>{q}</li>
          ))}
          {questions.length > 3 && (
            <li style={{ color: 'var(--text-muted)' }}>+{questions.length - 3} more</li>
          )}
        </ul>
      )}

      {/* 5. Topics — quiet, collapsed */}
      {topics.length > 0 && <ChipGroup items={topics} max={4} tone="tech" />}

      {/* Meta — grouped, secondary (mirrors JobCard) */}
      <Meta items={metaItems} />

      {/* 6. Read */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          paddingTop: 'var(--spacing-xs)',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 'auto',
        }}
      >
        <Link href={`/reports/${report.id}`}>
          <Button size="sm">Read report</Button>
        </Link>
      </div>
    </article>
  );
}