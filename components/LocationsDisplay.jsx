'use client';

import { useState } from 'react';

/**
 * Show the primary location + a +N chip with hover for the rest.
 * Mirrors Discover's CompaniesDisplay pattern.
 */
export default function LocationsDisplay({ locations = [] }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const list = (locations || []).map((l) => String(l).trim()).filter(Boolean);

  if (!list.length) return null;
  if (list.length === 1) return <span>{list[0]}</span>;

  const [first, ...rest] = list;

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--spacing-xs)',
        flexWrap: 'wrap',
      }}
    >
      <span>{first}</span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: '28px',
          height: '20px',
          padding: '0 var(--spacing-xs)',
          backgroundColor: 'var(--color-primary-light)',
          color: 'var(--text-primary)',
          borderRadius: 'var(--border-radius-sm)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: 'var(--font-weight-semibold)',
          cursor: 'help',
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={`${rest.length} more locations`}
      >
        +{rest.length}
      </span>
      {showTooltip && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: 'var(--spacing-xs)',
            padding: 'var(--spacing-sm) var(--spacing-md)',
            backgroundColor: 'var(--color-gray-900)',
            color: 'var(--text-inverse)',
            borderRadius: 'var(--border-radius-sm)',
            fontSize: 'var(--font-size-sm)',
            whiteSpace: 'normal',
            maxWidth: '280px',
            zIndex: 1000,
            boxShadow: 'var(--shadow-lg)',
            pointerEvents: 'none',
            lineHeight: 'var(--line-height-relaxed)',
          }}
        >
          {rest.join(' · ')}
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: '12px',
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid var(--color-gray-900)',
            }}
          />
        </div>
      )}
    </span>
  );
}

/**
 * Split multi-site job.location strings into discrete places.
 * Prefer `;` / `|` separators — commas often mean "City, Country".
 */
export function parseJobLocations(location) {
  if (!location) return [];
  return String(location)
    .split(/\s*[;|]\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}
