import React from 'react';

export default function Alert({ children, variant = 'error', ...props }) {
  const variants = {
    error: {
      backgroundColor: 'var(--color-error-bg)',
      borderColor: 'var(--color-error-border)',
      color: 'var(--color-error)',
    },
    success: {
      backgroundColor: 'var(--color-success-muted)',
      borderColor: '#a7f3d0',
      color: 'var(--color-success)',
    },
    warning: {
      backgroundColor: 'var(--color-warning-muted)',
      borderColor: '#fde68a',
      color: 'var(--color-warning)',
    },
    info: {
      backgroundColor: 'var(--color-primary-muted)',
      borderColor: 'var(--color-primary-soft)',
      color: 'var(--color-primary)',
    },
  };

  const style = {
    padding: 'var(--spacing-lg)',
    borderRadius: 'var(--border-radius)',
    border: '1px solid',
    marginBottom: 'var(--spacing-lg)',
    fontSize: 'var(--font-size-sm)',
    lineHeight: 'var(--line-height-snug)',
    ...variants[variant],
    ...props.style,
  };

  return (
    <div style={style} role="alert" {...props}>
      {children}
    </div>
  );
}
