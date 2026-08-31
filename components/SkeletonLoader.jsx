import React from 'react';

/** Feed-style skeleton matching JobCard layout */
export default function SkeletonLoader({ rows = 4, variant = 'card' }) {
  if (variant === 'card') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            style={{
              backgroundColor: 'var(--bg-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--border-radius-lg)',
              padding: 'var(--spacing-xl)',
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--spacing-lg)',
            }}
          >
            <div style={{ display: 'flex', gap: 'var(--spacing-md)', alignItems: 'center' }}>
              <div style={{ ...bar, width: 36, height: 36, borderRadius: 6 }} />
              <div style={{ ...bar, width: '28%', height: 14 }} />
            </div>
            <div style={{ ...bar, width: '65%', height: 20 }} />
            <div style={{ ...bar, width: '40%', height: 32, borderRadius: 8 }} />
            <div style={{ display: 'flex', gap: 'var(--spacing-lg)' }}>
              <div style={{ ...bar, width: 72, height: 28 }} />
              <div style={{ ...bar, width: 88, height: 28 }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ ...bar, width: 56, height: 22, borderRadius: 6 }} />
              <div style={{ ...bar, width: 48, height: 22, borderRadius: 6 }} />
            </div>
            <div style={{ ...bar, width: 72, height: 32, alignSelf: 'flex-end', borderRadius: 6 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
          <div style={{ ...bar, flex: 1 }} />
          <div style={{ ...bar, flex: 1.4 }} />
          <div style={{ ...bar, flex: 0.8 }} />
        </div>
      ))}
    </div>
  );
}

const bar = {
  backgroundColor: 'var(--color-gray-200)',
  borderRadius: 'var(--border-radius-xs)',
  animation: 'pulse 1.4s ease-in-out infinite',
};
