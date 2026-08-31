'use client';

import React, { useState } from 'react';

export default function Tooltip({ children, content, position = 'top' }) {
  const [isVisible, setIsVisible] = useState(false);

  const positions = {
    top: {
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginBottom: 'var(--spacing-xs)',
    },
    bottom: {
      top: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      marginTop: 'var(--spacing-xs)',
    },
    left: {
      right: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginRight: 'var(--spacing-xs)',
    },
    right: {
      left: '100%',
      top: '50%',
      transform: 'translateY(-50%)',
      marginLeft: 'var(--spacing-xs)',
    },
  };

  const tooltipStyle = {
    position: 'absolute',
    ...positions[position],
    padding: 'var(--spacing-sm) var(--spacing-md)',
    backgroundColor: 'var(--color-gray-900)',
    color: 'var(--text-inverse)',
    borderRadius: 'var(--border-radius-sm)',
    fontSize: 'var(--font-size-xs)',
    zIndex: 'var(--z-tooltip)',
    boxShadow: 'var(--shadow-lg)',
    pointerEvents: 'none',
    opacity: isVisible ? 1 : 0,
    transition: 'opacity var(--transition-fast)',
    maxWidth: '400px',
    minWidth: '300px',
    whiteSpace: 'normal',
    lineHeight: 'var(--line-height-relaxed)',
    wordWrap: 'break-word',
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div style={tooltipStyle} role="tooltip">
          {content}
        </div>
      )}
    </span>
  );
}
