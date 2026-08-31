import React from 'react';

export default function EmptyState({
  title = 'No items found',
  message,
  action,
  icon,
}) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: 'var(--spacing-3xl) var(--spacing-xl)',
        backgroundColor: 'var(--bg-primary)',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--border-radius-lg)',
      }}
    >
      {icon && (
        <div
          style={{
            fontSize: 'var(--font-size-2xl)',
            marginBottom: 'var(--spacing-lg)',
            opacity: 0.5,
          }}
        >
          {icon}
        </div>
      )}
      <h3
        style={{
          fontSize: 'var(--font-size-lg)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--text-primary)',
          marginBottom: 'var(--spacing-sm)',
        }}
      >
        {title}
      </h3>
      {message && (
        <p
          style={{
            fontSize: 'var(--font-size-base)',
            color: 'var(--text-muted)',
            marginBottom: action ? 'var(--spacing-xl)' : 0,
            maxWidth: '28rem',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          {message}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
