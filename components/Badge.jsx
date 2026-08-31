import React from 'react';

/**
 * Badge — reserved for status that deserves attention (freshness, match).
 * variant: default | fresh | updated | recent | muted | accent
 */
export default function Badge({ children, variant = 'default', size = 'sm', ...props }) {
  const variants = {
    default: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
    },
    fresh: {
      backgroundColor: 'var(--color-fresh-bg)',
      color: 'var(--color-fresh)',
      fontWeight: 'var(--font-weight-semibold)',
      letterSpacing: 'var(--letter-spacing-wide)',
    },
    updated: {
      backgroundColor: 'var(--color-updated-bg)',
      color: 'var(--color-updated)',
      fontWeight: 'var(--font-weight-medium)',
    },
    recent: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
    },
    muted: {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid var(--border-color)',
    },
    accent: {
      backgroundColor: 'var(--color-primary-muted)',
      color: 'var(--color-primary)',
      fontWeight: 'var(--font-weight-medium)',
    },
  };

  const sizes = {
    sm: {
      fontSize: 'var(--font-size-xs)',
      padding: '2px 7px',
    },
    md: {
      fontSize: 'var(--font-size-sm)',
      padding: '3px 9px',
    },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        borderRadius: 'var(--border-radius-sm)',
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        ...sizes[size],
        ...variants[variant],
        ...props.style,
      }}
      {...props}
    >
      {children}
    </span>
  );
}
