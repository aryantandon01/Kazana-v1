'use client';

import React from 'react';
import Badge from '@/components/Badge';
import Tooltip from '@/components/Tooltip';
import { getConfidenceTone } from '@/lib/reports/presentation';

/**
 * Confidence badge — the report's signature signal, mirroring JobCard's
 * freshness block. The tint carries meaning: green = high, amber = medium,
 * neutral = low. Colour is never the only signal — the label always names it.
 *
 * The tinted row is shared by the browse card and the detail page so the same
 * information looks identical in both places. Callers slot date/signals
 * in as children; pass `tooltip` to explain that confidence is evidence-based
 * rather than a truth claim.
 *
 * @param {{
 *   confidence: { level?: string|null, score?: number|null }|null|undefined,
 *   tooltip?: string,
 *   children?: React.ReactNode,
 * }} props
 */
export default function ConfidenceBadge({ confidence, tooltip, children }) {
  const tone = getConfidenceTone(confidence);
  const score = Math.round((confidence?.score || 0) * 100);

  const badge = (
    <Badge
      variant="recent"
      size="md"
      style={{ backgroundColor: 'transparent', color: tone.color, fontWeight: 'var(--font-weight-semibold)' }}
    >
      {tone.label}
    </Badge>
  );

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 'var(--spacing-sm)',
        padding: 'var(--spacing-sm) var(--spacing-md)',
        borderRadius: 'var(--border-radius-sm)',
        backgroundColor: tone.background,
      }}
    >
      {tooltip ? <Tooltip content={tooltip}>{badge}</Tooltip> : badge}
      <span style={{ fontSize: 'var(--font-size-sm)', fontWeight: 'var(--font-weight-semibold)', color: tone.color }}>
        {score}%
      </span>
      {children}
    </div>
  );
}
