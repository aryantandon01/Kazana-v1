import React from 'react';

export default function Loading({ message = 'Loading...', fullScreen = false }) {
  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: fullScreen ? 'var(--spacing-2xl)' : 'var(--spacing-xl)',
    ...(fullScreen && {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      zIndex: 'var(--z-modal)',
    }),
  };

  const spinnerStyle = {
    width: '40px',
    height: '40px',
    border: '4px solid var(--color-gray-200)',
    borderTop: '4px solid var(--color-primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: 'var(--spacing-md)',
  };

  return (
    <div style={containerStyle}>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div style={spinnerStyle}></div>
      <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-size-base)' }}>
        {message}
      </p>
    </div>
  );
}

