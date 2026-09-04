'use client';

import React, { useState } from 'react';
import { useCredits } from '@/context/CreditsContext';
import CreditsModal from '@/components/CreditsModal';

/**
 * Subtle global AI-credit indicator for the header (authenticated only).
 * Quiet enough not to dominate; click opens the credits popover.
 */
export default function CreditBadge() {
  const { ai_credits, plan } = useCredits();
  const [open, setOpen] = useState(false);

  const label = plan?.name === 'Premium' ? 'Premium' : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`AI Credits: ${ai_credits}`}
        title="AI Credits"
        style={badgeStyle}
      >
        <span aria-hidden="true" style={{ marginRight: '5px' }}>✦</span>
        {ai_credits} AI Credits
        {label ? <span style={planTagStyle}>{label}</span> : null}
      </button>
      <CreditsModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}

const badgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 12px',
  fontSize: 'var(--font-size-sm)',
  fontWeight: 'var(--font-weight-medium)',
  color: 'var(--text-inverse)',
  backgroundColor: 'rgba(255, 255, 255, 0.08)',
  border: '1px solid rgba(255, 255, 255, 0.14)',
  borderRadius: 'var(--border-radius-sm)',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const planTagStyle = {
  marginLeft: '6px',
  padding: '2px 6px',
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-bold)',
  color: 'var(--color-primary, #6c5ce7)',
  backgroundColor: 'rgba(255, 255, 255, 0.12)',
  borderRadius: 'var(--border-radius-sm)',
};
