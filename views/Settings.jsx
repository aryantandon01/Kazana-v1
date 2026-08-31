'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Input from '@/components/Input';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import Toast from '@/components/Toast';

export default function Settings() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const [prefs, setPrefs] = useState({
    push_enabled: true,
    max_pushes_per_day: 5,
    quiet_hours_start: '22:00',
    quiet_hours_end: '08:00',
  });
  const [profile, setProfile] = useState({
    location: '',
    remote_only: false,
    is_student: false,
    min_match_score: 0.6,
    timezone: 'UTC',
  });

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }
    apiFetch('/api/preferences')
      .then(({ data }) => {
        if (data.notifications) setPrefs((p) => ({ ...p, ...data.notifications }));
        if (data.profile) setProfile((p) => ({ ...p, ...data.profile }));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [user, router]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiFetch('/api/preferences', {
        method: 'PATCH',
        body: JSON.stringify({
          notifications: {
            push_enabled: prefs.push_enabled,
            max_pushes_per_day: Number(prefs.max_pushes_per_day),
            quiet_hours_start: prefs.quiet_hours_start,
            quiet_hours_end: prefs.quiet_hours_end,
          },
          profile: {
            location: profile.location || null,
            remote_only: profile.remote_only,
            is_student: Boolean(profile.is_student),
            min_match_score: Number(profile.min_match_score),
            timezone: profile.timezone,
          },
        }),
      });
      setToast({ message: 'Settings saved', variant: 'success' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!user || loading) return <Loading message="Loading settings..." />;

  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-xl)', paddingBottom: 'var(--spacing-xl)', maxWidth: 'var(--container-md)' }}>
      <h1 style={{ marginBottom: 'var(--spacing-lg)' }}>Settings</h1>
      {error && <Alert variant="error">{error}</Alert>}
      <Card style={{ padding: 'var(--spacing-xl)' }}>
        <form onSubmit={handleSave}>
          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>Job match notifications</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
            <input
              type="checkbox"
              checked={prefs.push_enabled}
              onChange={(e) => setPrefs((p) => ({ ...p, push_enabled: e.target.checked }))}
            />
            Enable push notifications (mobile app)
          </label>
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>Max pushes per day</label>
            <Input
              type="number"
              min={0}
              max={50}
              value={prefs.max_pushes_per_day}
              onChange={(e) => setPrefs((p) => ({ ...p, max_pushes_per_day: e.target.value }))}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-lg)' }}>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>Quiet hours start (UTC)</label>
              <Input value={prefs.quiet_hours_start} onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_start: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>Quiet hours end (UTC)</label>
              <Input value={prefs.quiet_hours_end} onChange={(e) => setPrefs((p) => ({ ...p, quiet_hours_end: e.target.value }))} />
            </div>
          </div>

          <h2 style={{ fontSize: 'var(--font-size-lg)', marginBottom: 'var(--spacing-md)' }}>Matching preferences</h2>
          <div style={{ marginBottom: 'var(--spacing-md)' }}>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>Preferred location</label>
            <Input value={profile.location || ''} onChange={(e) => setProfile((p) => ({ ...p, location: e.target.value }))} placeholder="e.g. Remote, San Francisco" />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
            <input type="checkbox" checked={profile.remote_only} onChange={(e) => setProfile((p) => ({ ...p, remote_only: e.target.checked }))} />
            Remote jobs only
          </label>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-md)' }}>
            <input
              type="checkbox"
              checked={Boolean(profile.is_student)}
              onChange={(e) => setProfile((p) => ({ ...p, is_student: e.target.checked }))}
              style={{ marginTop: '0.2rem' }}
            />
            <span>
              I am a student
              <span style={{ display: 'block', fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginTop: '0.15rem' }}>
                Students only see internships and entry-level roles. Non-students never see internships.
              </span>
            </span>
          </label>
          <div style={{ marginBottom: 'var(--spacing-lg)' }}>
            <label style={{ display: 'block', marginBottom: 'var(--spacing-xs)', fontSize: 'var(--font-size-sm)' }}>Minimum match score (0–1)</label>
            <Input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={profile.min_match_score}
              onChange={(e) => setProfile((p) => ({ ...p, min_match_score: e.target.value }))}
            />
          </div>

          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save settings'}</Button>
        </form>
      </Card>
      {toast && <Toast message={toast.message} variant={toast.variant} onClose={() => setToast(null)} />}
    </div>
  );
}
