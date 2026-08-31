'use client';

import React from 'react';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  disabled = false,
  onClick,
  fullWidth = false,
  ...props
}) {
  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--spacing-sm)',
    fontWeight: 'var(--font-weight-medium)',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition: `background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast)`,
    fontFamily: 'var(--font-family)',
    textDecoration: 'none',
    outline: 'none',
    whiteSpace: 'nowrap',
  };

  const variants = {
    primary: {
      backgroundColor: 'var(--color-primary)',
      color: 'var(--text-inverse)',
      borderColor: 'var(--color-primary)',
    },
    secondary: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-color)',
    },
    outline: {
      backgroundColor: 'transparent',
      color: 'var(--text-primary)',
      borderColor: 'var(--border-color-strong)',
    },
    ghost: {
      backgroundColor: 'transparent',
      color: 'var(--text-secondary)',
      borderColor: 'transparent',
    },
    danger: {
      backgroundColor: 'var(--color-error)',
      color: 'var(--text-inverse)',
      borderColor: 'var(--color-error)',
    },
  };

  const sizes = {
    sm: {
      padding: '6px 12px',
      fontSize: 'var(--font-size-sm)',
      minHeight: '32px',
    },
    md: {
      padding: '8px 16px',
      fontSize: 'var(--font-size-base)',
      minHeight: '40px',
    },
    lg: {
      padding: '12px 20px',
      fontSize: 'var(--font-size-md)',
      minHeight: '48px',
    },
  };

  const style = {
    ...baseStyle,
    ...variants[variant],
    ...sizes[size],
    width: fullWidth ? '100%' : 'auto',
    opacity: disabled ? 0.55 : 1,
    ...props.style,
  };

  const className = `btn btn-${variant} btn-${size} ${disabled ? 'btn-disabled' : ''} ${fullWidth ? 'btn-full-width' : ''}`;

  return (
    <button
      type={type}
      className={className}
      style={style}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}
