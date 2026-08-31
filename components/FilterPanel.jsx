import React from 'react';

/**
 * Lightweight filter sidebar — rhythm over boxes.
 */
export default function FilterPanel({ title = 'Filters', onClear, hasActiveFilters, children }) {
  return (
    <aside style={{ width: '100%', flexShrink: 0 }}>
      <div
        style={{
          padding: 'var(--spacing-lg) 0',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 'var(--spacing-xl)',
            paddingBottom: 'var(--spacing-md)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--font-size-xs)',
              fontWeight: 'var(--font-weight-semibold)',
              letterSpacing: 'var(--letter-spacing-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
            }}
          >
            {title}
          </h2>
          {hasActiveFilters && onClear && (
            <button
              type="button"
              onClick={onClear}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-medium)',
                color: 'var(--color-primary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Clear
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-xl)' }}>
          {children}
        </div>
      </div>
    </aside>
  );
}

export function FilterField({ label, children }) {
  return (
    <div>
      <label
        style={{
          display: 'block',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-medium)',
          color: 'var(--text-muted)',
          marginBottom: 'var(--spacing-sm)',
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}
