import React from 'react';

/**
 * Page header — calm hierarchy: title + optional supporting line + actions.
 */
export default function PageHeader({ title, description, actions, eyebrow }) {
  return (
    <header
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 'var(--spacing-xl)',
        marginBottom: 'var(--spacing-2xl)',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0, flex: '1 1 280px' }}>
        {eyebrow && (
          <p
            className="text-caption"
            style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--text-muted)' }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          style={{
            margin: 0,
            marginBottom: description ? 'var(--spacing-sm)' : 0,
            fontSize: 'var(--font-size-3xl)',
            fontWeight: 'var(--font-weight-bold)',
            letterSpacing: 'var(--letter-spacing-tight)',
            lineHeight: 'var(--line-height-tight)',
          }}
        >
          {title}
        </h1>
        {description && (
          <p
            style={{
              margin: 0,
              maxWidth: '36rem',
              fontSize: 'var(--font-size-base)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--line-height-relaxed)',
            }}
          >
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: 'var(--spacing-sm)', flexShrink: 0, alignItems: 'center' }}>
          {actions}
        </div>
      )}
    </header>
  );
}
