import React from 'react';

export default function Card({ children, padding = 'lg', elevated = false, interactive = false, ...props }) {
  const paddingMap = {
    none: 0,
    sm: 'var(--spacing-lg)',
    md: 'var(--spacing-xl)',
    lg: 'var(--spacing-xl)',
    xl: 'var(--spacing-2xl)',
  };

  const style = {
    backgroundColor: 'var(--bg-primary)',
    borderRadius: 'var(--border-radius-lg)',
    border: '1px solid var(--border-color)',
    padding: paddingMap[padding] ?? paddingMap.lg,
    boxShadow: elevated ? 'var(--elevation-2)' : 'var(--elevation-1)',
    transition: interactive ? `border-color var(--transition-fast), background-color var(--transition-fast)` : undefined,
    ...props.style,
  };

  return (
    <div style={style} {...props}>
      {children}
    </div>
  );
}
