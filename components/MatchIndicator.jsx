import React from 'react';

/**
 * Resume match — useful, not decorative. Visual weight scales with score.
 */
export default function MatchIndicator({ score, reasons = [] }) {
  if (score == null || Number.isNaN(score)) return null;

  const pct = Math.round(score * 100);
  const tier = pct >= 70 ? 'strong' : pct >= 45 ? 'moderate' : 'low';

  const styles = {
    strong: {
      color: 'var(--color-match-strong)',
      bar: 'var(--color-match-strong)',
      bg: 'var(--color-match-strong-bg)',
      label: 'Strong match',
    },
    moderate: {
      color: 'var(--text-secondary)',
      bar: 'var(--color-primary)',
      bg: 'var(--color-primary-muted)',
      label: 'Match',
    },
    low: {
      color: 'var(--text-muted)',
      bar: 'var(--color-gray-300)',
      bg: 'var(--bg-tertiary)',
      label: 'Low match',
    },
  };

  const s = styles[tier];
  const hint = reasons.length ? reasons.slice(0, 2).join(', ') : null;

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}
      title={hint || `${pct}% resume match`}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)' }}>
        <span
          style={{
            fontSize: 'var(--font-size-sm)',
            fontWeight: tier === 'strong' ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
            color: s.color,
          }}
        >
          {s.label}
        </span>
        <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>{pct}%</span>
      </div>
      <div
        style={{
          height: 3,
          borderRadius: 'var(--border-radius-full)',
          backgroundColor: s.bg,
          overflow: 'hidden',
          width: '100%',
          maxWidth: 120,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            borderRadius: 'inherit',
            backgroundColor: s.bar,
            transition: 'width var(--transition-base)',
          }}
        />
      </div>
    </div>
  );
}
