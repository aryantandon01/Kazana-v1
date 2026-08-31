import React from 'react';

export default function SectionHeader({ title, description, action }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: 'var(--spacing-lg)',
        marginBottom: 'var(--spacing-lg)',
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-semibold)',
            letterSpacing: 'var(--letter-spacing-tight)',
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              margin: 'var(--spacing-xs) 0 0',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-muted)',
            }}
          >
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
