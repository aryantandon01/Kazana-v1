'use client';

import React, { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { useCredits } from '@/context/CreditsContext';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';

/**
 * Compact "AI Credits" popover — balance, plan, monthly usage, recent activity.
 * Deliberately small: credits support the product, they don't dominate it.
 */
export default function CreditsModal({ isOpen, onClose }) {
  const router = useRouter();
  const { user } = useAuth();
  const { plan, ai_credits } = useCredits();
  const modalRef = useRef(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!isOpen || !user) return undefined;
    let cancelled = false;
    apiFetch('/api/credits')
      .then(({ data }) => {
        if (!cancelled) setSummary(data);
      })
      .catch((err) => {
        if (!cancelled) console.error('load credits summary failed', err);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, user]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const month = summary?.this_month || { allowance: 0, used: 0 };
  const isPremium = plan?.slug === 'premium';
  const lowCredits = ai_credits < 10;

  return (
    <div style={overlayStyle} onClick={onClose} role="dialog" aria-modal="true" aria-label="AI Credits">
      <div ref={modalRef} style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div style={headerStyle}>
          <h2 style={titleStyle}>✦ AI Credits</h2>
          <button type="button" onClick={onClose} style={closeStyle} aria-label="Close">
            ×
          </button>
        </div>

        <p style={balanceStyle}>
          <strong style={{ fontSize: 'var(--font-size-2xl, 24px)' }}>{ai_credits}</strong>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}> credits remaining</span>
        </p>

        <div style={rowStyle}>
          <span>Plan</span>
          <span style={{ fontWeight: 'var(--font-weight-bold)' }}>{plan?.name || 'Free'}</span>
        </div>
        <div style={rowStyle}>
          <span>This month</span>
          <span>
            {month.used} of {month.allowance} used
          </span>
        </div>

        {(summary?.recent_activity || []).length > 0 && (
          <div style={{ marginTop: 'var(--spacing-md)' }}>
            <p style={sectionLabelStyle}>Recent activity</p>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {(summary.recent_activity || []).slice(0, 6).map((tx) => (
                <div key={tx.id} style={activityRowStyle}>
                  <span style={{ fontSize: 'var(--font-size-sm)' }}>{tx.label}</span>
                  <span
                    style={{
                      fontWeight: 'var(--font-weight-bold)',
                      color: tx.amount > 0 ? 'var(--color-success, #27ae60)' : 'var(--text-secondary)',
                    }}
                  >
                    {tx.amount > 0 ? `+${tx.amount}` : tx.amount}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {lowCredits && (
          <div style={ctaStyle}>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
              {isPremium
                ? 'You are running low on AI credits.'
                : 'Free users get limited AI credits every month.'}
            </p>
            <button
              type="button"
              style={ctaButtonStyle}
              onClick={() => {
                onClose();
                router.push('/settings');
              }}
              title="Upgrades are coming soon"
            >
              {isPremium ? 'Get more credits' : 'Upgrade to Premium'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


const overlayStyle = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 'var(--z-modal-backdrop)',
  padding: 'var(--spacing-md)',
};

const modalStyle = {
  backgroundColor: 'var(--bg-primary)',
  borderRadius: 'var(--border-radius-lg)',
  padding: 'var(--spacing-lg)',
  maxWidth: '420px',
  width: '100%',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 'var(--z-modal)',
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 'var(--spacing-sm)',
};

const titleStyle = {
  fontSize: 'var(--font-size-xl)',
  fontWeight: 'var(--font-weight-bold)',
  margin: 0,
  color: 'var(--text-primary)',
};

const closeStyle = {
  background: 'none',
  border: 'none',
  fontSize: 'var(--font-size-xl)',
  color: 'var(--text-muted)',
  cursor: 'pointer',
  lineHeight: 1,
  padding: '4px',
};

const balanceStyle = {
  margin: '0 0 var(--spacing-md)',
  color: 'var(--text-primary)',
};

const rowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: 'var(--spacing-xs) 0',
  fontSize: 'var(--font-size-sm)',
  color: 'var(--text-secondary)',
  borderTop: '1px solid var(--border-color)',
};

const sectionLabelStyle = {
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  margin: '0 0 var(--spacing-xs)',
};

const activityRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '6px 0',
  color: 'var(--text-secondary)',
  borderBottom: '1px solid var(--border-color)',
};

const ctaStyle = {
  marginTop: 'var(--spacing-md)',
  padding: 'var(--spacing-md)',
  borderRadius: 'var(--border-radius-sm)',
  backgroundColor: 'var(--bg-secondary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--spacing-sm)',
};

const ctaButtonStyle = {
  padding: '8px 14px',
  border: 'none',
  borderRadius: 'var(--border-radius-sm)',
  backgroundColor: 'var(--color-primary)',
  color: 'var(--text-inverse)',
  fontWeight: 'var(--font-weight-bold)',
  fontSize: 'var(--font-size-sm)',
  cursor: 'pointer',
};
