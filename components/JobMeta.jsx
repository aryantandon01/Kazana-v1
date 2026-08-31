import React from 'react';
import LocationsDisplay, { parseJobLocations } from '@/components/LocationsDisplay';

/**
 * Grouped job metadata — separate visual units, not a paragraph.
 */
export default function JobMeta({ items = [] }) {
  const visible = items.filter((item) => item?.value != null && item.value !== '');
  if (!visible.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 'var(--spacing-sm) var(--spacing-lg)',
        marginTop: 'var(--spacing-md)',
      }}
    >
      {visible.map((item) => (
        <div key={item.label} style={{ minWidth: 0 }}>
          <p
            className="text-caption"
            style={{
              margin: 0,
              marginBottom: '2px',
              color: 'var(--text-muted)',
              fontSize: '10px',
            }}
          >
            {item.label}
          </p>
          <div
            style={{
              margin: 0,
              fontSize: 'var(--font-size-sm)',
              color: 'var(--text-secondary)',
              fontWeight: 'var(--font-weight-medium)',
              lineHeight: 'var(--line-height-snug)',
            }}
          >
            {item.node || item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function buildJobMetaItems(job) {
  const employment = (job.employment_types || [])[0]?.label;
  const experience = (job.experience_levels || [])[0]?.label;
  const arrangement = (job.work_arrangements || [])[0]?.label;
  const locations = parseJobLocations(job.location);

  return [
    locations.length
      ? {
          label: 'Location',
          value: locations[0],
          node: <LocationsDisplay locations={locations} />,
        }
      : null,
    experience ? { label: 'Experience', value: experience } : job.level ? { label: 'Level', value: job.level } : null,
    employment ? { label: 'Employment', value: employment } : null,
    arrangement ? { label: 'Work', value: arrangement } : null,
    job.years_required != null ? { label: 'Years', value: `${job.years_required}+ yrs` } : null,
  ].filter(Boolean);
}
