'use client';

import React from 'react';

/**
 * Pagination — windowed page control.
 *
 * Extracted from the inline renderer that used to live in Jobs.jsx so the jobs
 * and experiences browsers share one implementation and cannot drift apart.
 * Shows a 5-page window with first/last jumps when the range is wider.
 */
export default function Pagination({ currentPage, totalPages, onChange, label = 'Pagination' }) {
  if (!totalPages || totalPages <= 1) return null;

  const btn = (active) => ({
    minWidth: '32px',
    height: '32px',
    padding: '0 8px',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    backgroundColor: active ? 'var(--color-primary)' : 'var(--bg-primary)',
    color: active ? 'var(--text-inverse)' : 'var(--text-primary)',
    cursor: 'pointer',
    fontSize: 'var(--font-size-xs)',
    fontFamily: 'inherit',
  });

  const getWindow = () => {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (currentPage <= 3) return [1, 2, 3, 4, 5];
    if (currentPage >= totalPages - 2) {
      return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
  };

  const pages = getWindow();
  const showLast = totalPages > 5 && pages[pages.length - 1] < totalPages;

  return (
    <nav
      aria-label={label}
      style={{
        display: 'flex',
        justifyContent: 'flex-end',
        alignItems: 'center',
        gap: 'var(--spacing-xs)',
        marginTop: 'var(--spacing-2xl)',
      }}
    >
      <button
        type="button"
        onClick={() => onChange((page) => Math.max(1, page - 1))}
        disabled={currentPage === 1}
        aria-label="Previous page"
        style={{ ...btn(false), opacity: currentPage === 1 ? 0.45 : 1 }}
      >
        Prev
      </button>
      {pages.map((page) => (
        <button
          key={page}
          type="button"
          onClick={() => onChange(page)}
          aria-current={currentPage === page ? 'page' : undefined}
          style={btn(currentPage === page)}
        >
          {page}
        </button>
      ))}
      {showLast && (
        <>
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)' }}>…</span>
          <button type="button" onClick={() => onChange(totalPages)} style={btn(currentPage === totalPages)}>
            Last
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => onChange((page) => Math.min(totalPages, page + 1))}
        disabled={currentPage === totalPages}
        aria-label="Next page"
        style={{ ...btn(false), opacity: currentPage === totalPages ? 0.45 : 1 }}
      >
        Next
      </button>
    </nav>
  );
}
