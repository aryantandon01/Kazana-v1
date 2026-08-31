'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';

export default function PDFThumbnail({ fileUrl, onClick, size = 'small' }) {
  const [error, setError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(null);

  useEffect(() => {
    if (!fileUrl) {
      setResolvedUrl(null);
      return;
    }

    // If it's already a full URL, use it
    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      setResolvedUrl(fileUrl);
      return;
    }

    // Otherwise, resolve it from Supabase storage
    const { data } = supabase.storage
      .from('resumes')
      .getPublicUrl(fileUrl);
    
    if (data?.publicUrl) {
      setResolvedUrl(data.publicUrl);
    } else {
      // Fallback: construct URL manually
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        const fullUrl = `${baseUrl}/storage/v1/object/public/resumes/${fileUrl}`;
        setResolvedUrl(fullUrl);
      }
    }
  }, [fileUrl]);

  const sizes = {
    small: {
      width: '60px',
      height: '80px',
      fontSize: '24px',
    },
    medium: {
      width: '120px',
      height: '160px',
      fontSize: '48px',
    },
    large: {
      width: '180px',
      height: '240px',
      fontSize: '72px',
    },
  };

  const sizeStyle = sizes[size] || sizes.small;

  const containerStyle = {
    width: sizeStyle.width,
    height: sizeStyle.height,
    backgroundColor: 'var(--color-gray-100)',
    border: '1px solid var(--border-color)',
    borderRadius: 'var(--border-radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform var(--transition-fast), box-shadow var(--transition-fast)',
    overflow: 'hidden',
    position: 'relative',
  };

  const iconStyle = {
    fontSize: sizeStyle.fontSize,
    color: 'var(--color-error)',
  };

  const handleMouseEnter = (e) => {
    if (onClick) {
      e.currentTarget.style.transform = 'scale(1.05)';
      e.currentTarget.style.boxShadow = 'var(--shadow-md)';
    }
  };

  const handleMouseLeave = (e) => {
    e.currentTarget.style.transform = 'scale(1)';
    e.currentTarget.style.boxShadow = 'none';
  };

  // PDF thumbnails in small containers are unreliable across browsers
  // Use a styled document icon that looks professional
  // For larger sizes, try Google Docs viewer as a fallback
  const useGoogleViewer = size !== 'small' && resolvedUrl && !error;

  return (
    <div
      style={containerStyle}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      title="Click to view PDF"
    >
      {useGoogleViewer ? (
        <iframe
          src={`https://docs.google.com/viewer?url=${encodeURIComponent(resolvedUrl)}&embedded=true`}
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            pointerEvents: 'none',
          }}
          onError={() => setError(true)}
          title="PDF Preview"
        />
      ) : (
        <div style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 'var(--spacing-xs)',
          padding: 'var(--spacing-xs)',
          background: 'linear-gradient(135deg, var(--color-gray-50) 0%, var(--color-gray-100) 100%)',
        }}>
          <div style={{
            fontSize: sizeStyle.fontSize,
            lineHeight: 1,
          }}>
            📄
          </div>
          {size !== 'small' && (
            <div style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              textAlign: 'center',
              fontWeight: 'var(--font-weight-medium)',
            }}>
              PDF
            </div>
          )}
        </div>
      )}
    </div>
  );
}
