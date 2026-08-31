'use client';

import React, { useEffect, useState } from 'react';

export default function Toast({ message, variant = 'success', duration = 3000, onClose }) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(() => {
        if (onClose) onClose();
      }, 300); // Wait for fade out animation
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const variants = {
    success: {
      backgroundColor: '#d1fae5',
      borderColor: '#a7f3d0',
      color: 'var(--color-success)',
    },
    error: {
      backgroundColor: 'var(--color-error-bg)',
      borderColor: 'var(--color-error-border)',
      color: 'var(--color-error)',
    },
    warning: {
      backgroundColor: '#fef3c7',
      borderColor: '#fde68a',
      color: 'var(--color-warning)',
    },
    info: {
      backgroundColor: 'var(--color-primary-light)',
      borderColor: 'var(--color-primary)',
      color: 'var(--color-primary)',
    },
  };

  const style = {
    position: 'fixed',
    top: 'var(--spacing-lg)',
    right: 'var(--spacing-lg)',
    padding: 'var(--spacing-md) var(--spacing-lg)',
    borderRadius: 'var(--border-radius-sm)',
    border: '1px solid',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 'var(--z-tooltip)',
    minWidth: '300px',
    maxWidth: '500px',
    opacity: isVisible ? 1 : 0,
    transform: isVisible ? 'translateY(0)' : 'translateY(-20px)',
    transition: 'opacity 300ms ease-in-out, transform 300ms ease-in-out',
    ...variants[variant],
  };

  return (
    <div style={style} role="alert">
      {message}
    </div>
  );
}
