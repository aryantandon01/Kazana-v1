import React from 'react';

/** Subtle company identity — initials avatar, no external logo dependency. */
export default function CompanyAvatar({ name, size = 36 }) {
  const label = String(name || '?').trim();
  const initials = label
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  const hue = hashString(label) % 360;

  return (
    <div
      aria-hidden
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--border-radius-sm)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size <= 32 ? 'var(--font-size-xs)' : 'var(--font-size-sm)',
        fontWeight: 'var(--font-weight-semibold)',
        letterSpacing: '0.02em',
        color: `hsl(${hue}, 28%, 38%)`,
        backgroundColor: `hsl(${hue}, 24%, 94%)`,
      }}
    >
      {initials}
    </div>
  );
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}
