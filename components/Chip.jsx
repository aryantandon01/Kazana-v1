'use client';

import React, { useState } from 'react';

/**
 * Chip — lightweight semantic label (career area, technology).
 * Prefer ChipGroup for lists so overflow collapses.
 */
export default function Chip({ children, tone = 'neutral', title, onClick }) {
  const tones = {
    neutral: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
    },
    area: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-secondary)',
    },
    tech: {
      backgroundColor: 'var(--bg-tertiary)',
      color: 'var(--text-muted)',
    },
    soft: {
      backgroundColor: 'transparent',
      color: 'var(--text-muted)',
      border: '1px solid var(--border-color)',
    },
  };

  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      title={title}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 'var(--font-size-xs)',
        fontWeight: 'var(--font-weight-medium)',
        lineHeight: 1.3,
        padding: '3px 8px',
        borderRadius: 'var(--border-radius-sm)',
        border: 'none',
        cursor: onClick ? 'pointer' : 'default',
        fontFamily: 'inherit',
        ...tones[tone],
      }}
    >
      {children}
    </Tag>
  );
}

/**
 * Shows the most valuable chips; collapses the rest behind +N.
 */
export function ChipGroup({ items = [], max = 3, tone = 'neutral', getKey, getLabel }) {
  const [expanded, setExpanded] = useState(false);
  if (!items.length) return null;

  const resolveKey = getKey || ((item, i) => (typeof item === 'string' ? item : item.value || item.slug || i));
  const resolveLabel = getLabel || ((item) => (typeof item === 'string' ? item : item.label || item.name));

  const visible = expanded ? items : items.slice(0, max);
  const hiddenCount = items.length - max;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
      {visible.map((item, i) => (
        <Chip key={resolveKey(item, i)} tone={tone}>
          {resolveLabel(item)}
        </Chip>
      ))}
      {!expanded && hiddenCount > 0 && (
        <Chip tone="soft" onClick={() => setExpanded(true)} title="Show more">
          +{hiddenCount}
        </Chip>
      )}
      {expanded && items.length > max && (
        <Chip tone="soft" onClick={() => setExpanded(false)}>
          Less
        </Chip>
      )}
    </div>
  );
}
