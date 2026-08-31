'use client';

import { useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/Badge';
import Button from '@/components/Button';
import CompanyAvatar from '@/components/CompanyAvatar';
import MatchIndicator from '@/components/MatchIndicator';
import JobMeta, { buildJobMetaItems } from '@/components/JobMeta';
import { ChipGroup } from '@/components/Chip';
import { getJobFreshnessDisplay } from '@/lib/jobs/freshness';

/**
 * Job card — scan order:
 * Company → Role → Freshness → Match → Meta → Areas → Tech → Apply
 */
export default function JobCard({ job, match }) {
  const [hovered, setHovered] = useState(false);
  const freshness = getJobFreshnessDisplay(job);
  const metaItems = buildJobMetaItems(job);
  const careerAreas = job.career_areas || [];
  const employerTags = (job.tags || []).filter((t) => t.source === 'employer');
  const techTags = employerTags.length ? employerTags : (job.tags || []).slice(0, 8);

  return (
    <article
      className="fade-in job-card"
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
        <CompanyAvatar name={job.company_name} size={36} />
        <p
          style={{
            margin: 0,
            fontSize: 'var(--font-size-sm)',
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.01em',
          }}
        >
          {job.company_name}
        </p>
      </div>

      {/* 2. Role */}
      <Link
        href={`/jobs/${job.id}`}
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
        {job.title}
      </Link>

      {/* 3. Freshness — signature, first-class */}
      {(freshness.badge.kind || freshness.primary) && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--spacing-sm)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            borderRadius: 'var(--border-radius-sm)',
            backgroundColor: freshness.isLive ? 'var(--color-fresh-bg)' : 'var(--bg-tertiary)',
          }}
        >
          {freshness.badge.kind && (
            <Badge
              variant={
                freshness.badge.kind === 'new'
                  ? 'fresh'
                  : freshness.badge.kind === 'updated'
                    ? 'updated'
                    : 'recent'
              }
              size="md"
            >
              {freshness.badge.label === 'NEW' ? 'NEW' : freshness.badge.label}
            </Badge>
          )}
          {freshness.primary && (
            <span
              style={{
                fontSize: 'var(--font-size-sm)',
                fontWeight: freshness.isLive ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
                color: freshness.badge.kind === 'new' ? 'var(--color-fresh)' : 'var(--text-secondary)',
              }}
            >
              {freshness.primary}
            </span>
          )}
          {freshness.secondary && (
            <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
              · {freshness.secondary}
            </span>
          )}
        </div>
      )}

      {/* 4. Resume match */}
      {match && match.score > 0 && (
        <MatchIndicator score={match.score} reasons={match.reasons} />
      )}

      {/* Metadata — grouped, secondary */}
      <JobMeta items={metaItems} />

      {/* 5–6. Career areas + tech — quiet, collapsed */}
      {(careerAreas.length > 0 || techTags.length > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
          {careerAreas.length > 0 && (
            <ChipGroup items={careerAreas} max={3} tone="area" />
          )}
          {techTags.length > 0 && (
            <ChipGroup
              items={techTags}
              max={3}
              tone="tech"
              getKey={(t, i) => `${t.slug || t.name}-${t.source || i}`}
              getLabel={(t) => t.name || t.label}
            />
          )}
        </div>
      )}

      {/* 7. Apply */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          paddingTop: 'var(--spacing-xs)',
          borderTop: '1px solid var(--border-subtle)',
          marginTop: 'auto',
        }}
      >
        <a href={job.url} target="_blank" rel="noopener noreferrer">
          <Button size="sm">Apply</Button>
        </a>
      </div>
    </article>
  );
}
