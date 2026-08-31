'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Badge from '@/components/Badge';
import Breadcrumbs from '@/components/Breadcrumbs';
import CompanyAvatar from '@/components/CompanyAvatar';
import JobMeta, { buildJobMetaItems } from '@/components/JobMeta';
import SkeletonLoader from '@/components/SkeletonLoader';
import { ChipGroup } from '@/components/Chip';
import { getJobFreshnessDisplay } from '@/lib/jobs/freshness';

export default function ViewJob() {
  const { id } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchJob() {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiFetch(`/api/jobs/${id}`);
        setJob(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (id) fetchJob();
  }, [id]);

  if (loading) {
    return (
      <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
        <SkeletonLoader rows={1} variant="card" />
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="container" style={{ paddingTop: 'var(--spacing-xl)', paddingBottom: 'var(--spacing-xl)' }}>
        <Breadcrumbs items={[{ label: 'Jobs', to: '/jobs' }, { label: 'Not found' }]} />
        <Alert variant="error">{error || 'Job not found'}</Alert>
        <Link href="/jobs" style={{ marginTop: 'var(--spacing-md)', display: 'inline-block' }}>
          <Button variant="outline">Back to jobs</Button>
        </Link>
      </div>
    );
  }

  const careerAreas = job.career_areas || [];
  const employerTags = (job.tags || []).filter((t) => t.source === 'employer');
  const aiTags = (job.tags || []).filter((t) => t.source === 'ai');
  const freshness = getJobFreshnessDisplay(job);
  const metaItems = buildJobMetaItems(job);

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-3xl)', maxWidth: 'var(--container-md)' }}>
      <Breadcrumbs items={[{ label: 'Jobs', to: '/jobs' }, { label: job.title }]} />

      <Card padding="xl">
        <header style={{ marginBottom: 'var(--spacing-xl)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
            <CompanyAvatar name={job.company_name} size={44} />
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', fontWeight: 600, color: 'var(--text-secondary)' }}>
              {job.company_name}
            </p>
          </div>

          <h1 style={{ margin: 0, marginBottom: 'var(--spacing-md)', fontSize: 'var(--font-size-3xl)', letterSpacing: 'var(--letter-spacing-tight)' }}>
            {job.title}
          </h1>

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
                marginBottom: 'var(--spacing-lg)',
              }}
            >
              {freshness.badge.kind && (
                <Badge variant={freshness.badge.kind === 'new' ? 'fresh' : freshness.badge.kind === 'updated' ? 'updated' : 'recent'} size="md">
                  {freshness.badge.label}
                </Badge>
              )}
              {freshness.primary && (
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--text-secondary)' }}>
                  {freshness.primary}
                </span>
              )}
            </div>
          )}

          <JobMeta items={metaItems} />
        </header>

        {careerAreas.length > 0 && (
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <ChipGroup items={careerAreas} max={6} tone="area" />
          </div>
        )}

        {(employerTags.length > 0 || aiTags.length > 0) && (
          <section style={{ marginBottom: 'var(--spacing-xl)' }}>
            {employerTags.length > 0 && (
              <div style={{ marginBottom: aiTags.length ? 'var(--spacing-lg)' : 0 }}>
                <p className="text-caption" style={{ marginBottom: 'var(--spacing-sm)' }}>Technologies</p>
                <ChipGroup
                  items={employerTags}
                  max={8}
                  tone="tech"
                  getKey={(t) => `e-${t.slug}`}
                  getLabel={(t) => t.name}
                />
              </div>
            )}
            {aiTags.length > 0 && (
              <div>
                <p className="text-caption" style={{ marginBottom: 'var(--spacing-sm)' }}>Kazana AI</p>
                <ChipGroup
                  items={aiTags}
                  max={6}
                  tone="soft"
                  getKey={(t) => `a-${t.slug}`}
                  getLabel={(t) => t.name}
                />
              </div>
            )}
          </section>
        )}

        <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', marginBottom: 'var(--spacing-2xl)' }}>
          <a href={job.url} target="_blank" rel="noopener noreferrer">
            <Button size="lg">Apply on company site</Button>
          </a>
        </div>

        {job.description && (
          <section>
            <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>Description</h2>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                lineHeight: 'var(--line-height-relaxed)',
                color: 'var(--text-primary)',
                fontSize: 'var(--font-size-base)',
              }}
            >
              {job.description}
            </div>
          </section>
        )}

        {job.job_sources?.license && (
          <footer style={{ marginTop: 'var(--spacing-xl)', paddingTop: 'var(--spacing-md)', borderTop: '1px solid var(--border-color)' }}>
            <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', margin: 0 }}>
              Source: {job.job_sources.license}
            </p>
          </footer>
        )}
      </Card>

      <div style={{ marginTop: 'var(--spacing-lg)' }}>
        <Link href="/jobs">
          <Button variant="outline">← Back to all jobs</Button>
        </Link>
      </div>
    </div>
  );
}
