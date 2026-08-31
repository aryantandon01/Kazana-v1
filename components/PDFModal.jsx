'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import Card from '@/components/Card';
import { getJobFamilyByValue } from '@/constants/jobFamilies';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function PDFModal({ isOpen, onClose, onRequestClose, fileUrl, resumeData }) {
  const [pdfError, setPdfError] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024);
  const modalRef = useRef(null);
  const closeButtonRef = useRef(null);
  const previousActiveRef = useRef(null);

  const handleClose = onRequestClose || onClose;

  useEffect(() => {
    if (!isOpen) return;
    previousActiveRef.current = document.activeElement;
    if (closeButtonRef.current?.focus) closeButtonRef.current.focus();
    return () => {
      if (previousActiveRef.current?.focus) previousActiveRef.current.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        handleClose();
        return;
      }
      if (e.key !== 'Tab' || !modalRef.current) return;
      const focusable = [...modalRef.current.querySelectorAll(FOCUSABLE_SELECTOR)].filter(
        (el) => !el.hasAttribute('disabled') && el.tabIndex !== -1
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!fileUrl) {
      setResolvedUrl(null);
      return;
    }

    if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) {
      setResolvedUrl(fileUrl);
      return;
    }

    const { data } = supabase.storage
      .from('resumes')
      .getPublicUrl(fileUrl);
    
    if (data?.publicUrl) {
      console.log('Got public URL from Supabase:', data.publicUrl);
      setResolvedUrl(data.publicUrl);
    } else {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl) {
        const baseUrl = supabaseUrl.replace(/\/$/, '');
        const fullUrl = `${baseUrl}/storage/v1/object/public/resumes/${fileUrl}`;
        console.log('Constructed PDF URL from path:', fullUrl);
        setResolvedUrl(fullUrl);
      }
    }
  }, [fileUrl]);

  useEffect(() => {
    if (resolvedUrl) {
      setPdfError(false);
    }
  }, [resolvedUrl]);

  if (!isOpen) return null;

  const getCleanPdfUrl = (url) => {
    if (!url) return null;
    const baseUrl = url.split('#')[0];
    return `${baseUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
  };

  const pdfUrl = resolvedUrl ? getCleanPdfUrl(resolvedUrl) : null;

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        height: '100%',
        width: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 'var(--z-modal-backdrop)',
        backdropFilter: 'blur(2px)',
      }}
      onClick={handleClose}
    >
      <div 
        style={{
          background: 'var(--bg-primary)',
          padding: 'var(--spacing-md)',
          borderRadius: 'var(--border-radius-lg)',
          width: '95%',
          maxWidth: '1400px',
          height: '90%',
          position: 'relative',
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          gap: 'var(--spacing-lg)',
          boxShadow: 'var(--shadow-lg)',
          overflow: 'visible',
        }}
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          ref={closeButtonRef}
          onClick={handleClose}
          style={{
            position: 'absolute',
            top: isMobile ? '8px' : '-16px',
            right: isMobile ? '8px' : '-16px',
            zIndex: 'calc(var(--z-modal) + 1)',
            width: isMobile ? '44px' : '40px',
            height: isMobile ? '44px' : '40px',
            minWidth: '44px',
            minHeight: '44px',
            borderRadius: '50%',
            border: '2px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            fontSize: isMobile ? '1.4rem' : '1.3rem',
            fontWeight: 'var(--font-weight-bold)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-md)',
            transition: 'all var(--transition-base)',
            lineHeight: 1,
            padding: 0,
            touchAction: 'manipulation',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-error)';
            e.currentTarget.style.color = 'var(--text-inverse)';
            e.currentTarget.style.borderColor = 'var(--color-error)';
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
            e.currentTarget.style.color = 'var(--text-primary)';
            e.currentTarget.style.borderColor = 'var(--border-color)';
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
          }}
          onTouchStart={(e) => {
            e.currentTarget.style.backgroundColor = 'var(--color-error)';
            e.currentTarget.style.color = 'var(--text-inverse)';
            e.currentTarget.style.borderColor = 'var(--color-error)';
          }}
          onTouchEnd={(e) => {
            setTimeout(() => {
              e.currentTarget.style.backgroundColor = 'var(--bg-primary)';
              e.currentTarget.style.color = 'var(--text-primary)';
              e.currentTarget.style.borderColor = 'var(--border-color)';
            }, 150);
          }}
          aria-label="Close modal"
        >
          ✕
        </button>

        {/* PDF Viewer - Left Side */}
        <div style={{
          flex: resumeData && !isMobile ? '1 1 60%' : 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: isMobile && resumeData ? '50%' : 'auto',
        }}>
          {pdfUrl && pdfUrl.startsWith('http') ? (
            <>
              {pdfError ? (
                <div style={{ 
                  flex: 1, 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  padding: 'var(--spacing-2xl)'
                }}>
                  <p style={{ marginBottom: 'var(--spacing-md)', color: 'var(--color-error)' }}>
                    Failed to load PDF. Trying alternative viewer...
                  </p>
                  <iframe
                    src={`https://docs.google.com/viewer?url=${encodeURIComponent(pdfUrl)}&embedded=true`}
                    title="PDF Viewer (Google Docs)"
                    style={{ 
                      width: '100%', 
                      height: '100%',
                      border: 'none'
                    }}
                  />
                </div>
              ) : (
                <>
                  <iframe
                    src={pdfUrl}
                    title="PDF Viewer"
                    type="application/pdf"
                    style={{ 
                      width: '100%', 
                      height: '100%',
                      border: 'none',
                      flex: 1,
                      borderRadius: 'var(--border-radius-sm)',
                    }}
                    onLoad={() => {
                      console.log('PDF iframe loaded');
                    }}
                    onError={() => {
                      console.error('PDF load error, trying fallback');
                      setPdfError(true);
                    }}
                  />
                </>
              )}
            </>
          ) : (
            <div style={{ 
              flex: 1, 
              display: 'flex', 
              flexDirection: 'column',
              justifyContent: 'center', 
              alignItems: 'center',
              padding: 'var(--spacing-2xl)'
            }}>
              <p style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--color-error)' }}>
                {pdfUrl ? 'Invalid PDF URL format' : 'No PDF URL provided'}
              </p>
              {pdfUrl && (
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                  URL: {pdfUrl}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Resume Information - Right Side */}
        {resumeData && (
          <div style={{
            flex: isMobile ? '0 0 auto' : '0 0 350px',
            display: 'flex',
            flexDirection: 'column',
            overflowY: 'auto',
            maxHeight: isMobile ? '50%' : '100%',
            minHeight: isMobile ? '200px' : 'auto',
          }}>
            <Card padding="lg">
              <h3 style={{ 
                marginTop: 0,
                marginBottom: 'var(--spacing-lg)',
                fontSize: 'var(--font-size-xl)',
                fontWeight: 'var(--font-weight-bold)',
                color: 'var(--text-primary)',
              }}>
                Resume Details
              </h3>

              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-md)',
              }}>
                {(() => {
                  const companies = resumeData.companies && Array.isArray(resumeData.companies) 
                    ? resumeData.companies 
                    : (resumeData.company ? [resumeData.company] : []);
                  
                  if (companies.length === 0) return null;
                  
                  return (
                    <div>
                      <strong style={{ 
                        display: 'block',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--text-secondary)',
                        marginBottom: 'var(--spacing-xs)',
                      }}>
                        Companies ({companies.length})
                      </strong>
                      <div style={{ 
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 'var(--spacing-xs)',
                      }}>
                        {companies.map((company, idx) => (
                          <span
                            key={idx}
                            style={{
                              display: 'inline-block',
                              padding: 'var(--spacing-xs) var(--spacing-sm)',
                              backgroundColor: 'var(--color-primary-light)',
                              color: 'var(--text-primary)',
                              borderRadius: 'var(--border-radius-sm)',
                              fontSize: 'var(--font-size-sm)',
                            }}
                          >
                            {company}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {resumeData.job_family && (
                  <div>
                    <strong style={{ 
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}>
                      Job Family
                    </strong>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {getJobFamilyByValue(resumeData.job_family)?.label || resumeData.job_family}
                    </div>
                  </div>
                )}

                {resumeData.level && (
                  <div>
                    <strong style={{ 
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}>
                      Level
                    </strong>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {resumeData.level}
                    </div>
                  </div>
                )}

                {(resumeData.years_of_experience || resumeData.years) && (
                  <div>
                    <strong style={{ 
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}>
                      Years of Experience
                    </strong>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {resumeData.years_of_experience || resumeData.years}
                    </div>
                  </div>
                )}

                {resumeData.country && (
                  <div>
                    <strong style={{ 
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}>
                      Country
                    </strong>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {resumeData.country}
                    </div>
                  </div>
                )}

                {resumeData.university && (
                  <div>
                    <strong style={{ 
                      display: 'block',
                      fontSize: 'var(--font-size-sm)',
                      color: 'var(--text-secondary)',
                      marginBottom: 'var(--spacing-xs)',
                    }}>
                      University
                    </strong>
                    <div style={{ color: 'var(--text-primary)' }}>
                      {resumeData.university}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
