import React from 'react';
import Link from 'next/link';

export default function Breadcrumbs({ items }) {
  if (!items?.length) return null;

  const separatorStyle = {
    color: 'var(--text-muted)',
    margin: '0 var(--spacing-xs)',
    fontSize: 'var(--font-size-sm)',
  };

  const linkStyle = {
    color: 'var(--color-primary)',
    textDecoration: 'none',
    fontSize: 'var(--font-size-sm)',
  };

  const currentStyle = {
    color: 'var(--text-secondary)',
    fontSize: 'var(--font-size-sm)',
  };

  return (
    <nav aria-label="Breadcrumb" style={{ marginBottom: 'var(--spacing-md)' }}>
      <ol style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', listStyle: 'none', margin: 0, padding: 0, gap: 0 }}>
        {items.map((item, index) => (
          <li key={index} style={{ display: 'inline-flex', alignItems: 'center' }}>
            {index > 0 && <span style={separatorStyle}>/</span>}
            {(item.href || item.to) ? (
              <Link href={item.href || item.to} style={linkStyle}>
                {item.label}
              </Link>
            ) : (
              <span style={currentStyle}>{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
