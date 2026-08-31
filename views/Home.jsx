'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Card from '@/components/Card';
import Button from '@/components/Button';
import PageHeader from '@/components/PageHeader';
import SectionHeader from '@/components/SectionHeader';
import Badge from '@/components/Badge';
import JobCard from '@/components/JobCard';
import EmptyState from '@/components/EmptyState';
import SkeletonLoader from '@/components/SkeletonLoader';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api/client';
import { scoreJobForUser } from '@/lib/matching/score';

const TRENDING_AREAS = [
  { label: 'AI', href: '/jobs?career_area=ai' },
  { label: 'Machine Learning', href: '/jobs?career_area=machine_learning' },
  { label: 'Backend', href: '/jobs?career_area=backend' },
  { label: 'Cloud', href: '/jobs?career_area=cloud' },
];

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ newJobs: null, updatedJobs: null });
  const [recentJobs, setRecentJobs] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [userResumes, setUserResumes] = useState([]);
  const [userProfile, setUserProfile] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [newRes, updatedRes, recentRes] = await Promise.all([
          apiFetch('/api/jobs?freshness=today&limit=1'),
          apiFetch('/api/jobs?freshness=3d&limit=1&sort=last_updated_at&dir=desc'),
          apiFetch('/api/jobs?freshness=1h&limit=5&sort=discovered_at&dir=desc'),
        ]);

        let resumes = [];
        let profile = null;

        if (user) {
          try {
            const [resumesRes, prefsRes] = await Promise.all([
              apiFetch('/api/resumes/mine'),
              apiFetch('/api/preferences'),
            ]);
            resumes = resumesRes.data || [];
            profile = prefsRes.data?.profile || null;
          } catch {
            // continue with empty resume/profile
          }
        }

        if (!cancelled) {
          setStats({
            newJobs: newRes.meta?.total ?? 0,
            updatedJobs: updatedRes.meta?.total ?? 0,
          });
          setRecentJobs(recentRes.data || []);
          setUserResumes(resumes);
          setUserProfile(profile);
        }
      } catch {
        if (!cancelled) {
          setStats({ newJobs: null, updatedJobs: null });
          setRecentJobs([]);
        }
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const recentWithMatch = recentJobs.map((job) => ({
    job,
    match: user && userResumes.length ? scoreJobForUser(job, userResumes, userProfile) : null,
  }));

  return (
    <div
      className="container"
      style={{ paddingTop: 'var(--spacing-3xl)', paddingBottom: 'var(--spacing-4xl)' }}
    >
      <PageHeader
        eyebrow="Today"
        title="What changed since your last visit"
        description="New roles and fresh updates worth your attention — in one calm view."
        actions={
          <Link href="/jobs">
            <Button>Continue browsing</Button>
          </Link>
        }
      />

      <section style={{ marginBottom: 'var(--spacing-3xl)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 'var(--spacing-lg)',
          }}
        >
          <StatCard label="New jobs today" value={stats.newJobs} href="/jobs?freshness=today" accent />
          <StatCard label="Updated · 3 days" value={stats.updatedJobs} href="/jobs?freshness=3d&sort=last_updated_at" />
        </div>
      </section>

      <section style={{ marginBottom: 'var(--spacing-3xl)' }}>
        <SectionHeader
          title="Just discovered"
          description="Roles that landed in the last hour."
          action={
            <Link href="/jobs?freshness=1h" style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500 }}>
              View all
            </Link>
          }
        />
        {loadingRecent ? (
          <SkeletonLoader rows={2} variant="card" />
        ) : recentWithMatch.length === 0 ? (
          <EmptyState
            title="Nothing new in the last hour"
            message="Check back soon — Kazana ingests continuously from licensed sources."
            action={
              <Link href="/jobs">
                <Button variant="outline">Browse all jobs</Button>
              </Link>
            }
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
            {recentWithMatch.slice(0, 3).map(({ job, match }) => (
              <JobCard key={job.id} job={job} match={match} />
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: 'var(--spacing-3xl)' }}>
        <SectionHeader title="Trending career areas" description="Where hiring momentum is concentrated." />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-sm)' }}>
          {TRENDING_AREAS.map((area) => (
            <Link key={area.label} href={area.href} style={{ textDecoration: 'none' }}>
              <Card
                padding="sm"
                interactive
                style={{ cursor: 'pointer', minWidth: 120 }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
                }}
              >
                <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {area.label}
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Explore" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--spacing-md)' }}>
          <Link href="/discover"><Button variant="outline">Discover resumes</Button></Link>
          <Link href="/jobs?remote=true"><Button variant="ghost">Remote roles</Button></Link>
          {user ? (
            <Link href="/add-resume"><Button variant="ghost">Add resume</Button></Link>
          ) : (
            <Link href="/login"><Button variant="ghost">Sign in</Button></Link>
          )}
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value, href, accent, hint }) {
  const display = value == null ? '…' : typeof value === 'number' ? value.toLocaleString() : value;

  return (
    <Link href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
      <Card padding="lg" interactive style={{ height: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <p className="text-caption" style={{ margin: 0 }}>{label}</p>
          {accent && value != null && value > 0 && <Badge variant="fresh">LIVE</Badge>}
        </div>
        <p
          style={{
            margin: 'var(--spacing-md) 0 0',
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 'var(--font-weight-bold)',
            letterSpacing: 'var(--letter-spacing-tight)',
            color: accent && value > 0 ? 'var(--color-fresh)' : 'var(--text-primary)',
            lineHeight: 1,
          }}
        >
          {display}
        </p>
        {hint && (
          <p style={{ margin: 'var(--spacing-sm) 0 0', fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>
            {hint}
          </p>
        )}
      </Card>
    </Link>
  );
}
