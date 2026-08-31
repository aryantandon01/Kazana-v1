'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api/client';
import { useAuth } from '@/context/AuthContext';
import PDFModal from '@/components/PDFModal';
import ConfirmationModal from '@/components/ConfirmationModal';
import Toast from '@/components/Toast';
import Card from '@/components/Card';
import Button from '@/components/Button';
import Loading from '@/components/Loading';
import EmptyState from '@/components/EmptyState';
import Alert from '@/components/Alert';
import { getJobFamilyByValue } from '@/constants/jobFamilies';

export default function ResumeManager() {
  const router = useRouter();
  const { user } = useAuth();
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [selectedFileURL, setSelectedFileURL] = useState(null);
  const [selectedResume, setSelectedResume] = useState(null);
  const [deleting, setDeleting] = useState(null); // Track which resume is being deleted
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [resumeToDelete, setResumeToDelete] = useState(null);
  const [toast, setToast] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
      return;
    }

    const fetchResumes = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiFetch('/api/resumes/mine');
        setResumes(data || []);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching resumes:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResumes();
  }, [user, router]);

  useEffect(() => {
    const totalPages = Math.ceil(resumes.length / itemsPerPage) || 1;
    if (currentPage > totalPages && totalPages >= 1) {
      setCurrentPage(totalPages);
    }
  }, [resumes.length, currentPage, itemsPerPage]);

  if (!user) return <Loading />;

  const handleViewClick = (file_url, resume) => {
    setSelectedFileURL(file_url);
    setSelectedResume(resume);
    setShowModal(true);
  };

  const handleDeleteClick = (resumeId) => {
    setResumeToDelete(resumeId);
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!resumeToDelete) return;

    setDeleting(resumeToDelete);
    setError(null);
    setShowDeleteConfirm(false);

    try {
      await apiFetch(`/api/resumes/${resumeToDelete}`, { method: 'DELETE' });

      // Remove from local state
      setResumes(prevResumes => prevResumes.filter(r => r.id !== resumeToDelete));
      setToast({ message: 'Resume deleted successfully', variant: 'success' });
    } catch (err) {
      setError(err.message);
      setToast({ message: err.message, variant: 'error' });
      console.error('Error deleting resume:', err);
    } finally {
      setDeleting(null);
      setResumeToDelete(null);
    }
  };

  const tableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'var(--bg-primary)',
  };

  const thStyle = {
    padding: 'var(--spacing-md)',
    textAlign: 'center',
    backgroundColor: 'var(--color-gray-100)',
    fontWeight: 'var(--font-weight-semibold)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-primary)',
    borderBottom: '2px solid var(--border-color)',
  };

  const tdStyle = {
    padding: 'var(--spacing-md)',
    borderBottom: '1px solid var(--border-color)',
    fontSize: 'var(--font-size-base)',
    color: 'var(--text-primary)',
    textAlign: 'center',
  };

  const totalPages = Math.ceil(resumes.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedResumes = resumes.slice(startIndex, endIndex);

  if (loading) {
    return <Loading message="Loading your resumes..." />;
  }

  return (
    <div className="container" style={{ 
      paddingTop: 'var(--spacing-xl)',
      paddingBottom: 'var(--spacing-xl)',
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 'var(--spacing-lg)',
        flexWrap: 'wrap',
        gap: 'var(--spacing-md)',
      }}>
        <h2 style={{ margin: 0 }}>My Resumes</h2>
        <Link href="/add-resume">
          <Button>+ Add New Resume</Button>
        </Link>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {resumes.length === 0 ? (
        <EmptyState
          title="No resumes uploaded yet"
          message="Start by adding your first resume to share with others"
          action={
            <Link href="/add-resume">
              <Button>Add Your First Resume</Button>
            </Link>
          }
        />
      ) : isMobile ? (
        // Mobile Card Layout
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
          {paginatedResumes.map((resume, index) => (
            <Card key={resume.id} padding="lg" className="fade-in" style={{ animationDelay: `${index * 50}ms` }}>
              <div style={{ marginBottom: 'var(--spacing-md)' }}>
                <h3 style={{ 
                  margin: 0, 
                  marginBottom: 'var(--spacing-xs)',
                  fontSize: 'var(--font-size-lg)',
                  fontWeight: 'var(--font-weight-bold)',
                }}>
                  {resume.name || 'Untitled Resume'}
                </h3>
                <div style={{ 
                  display: 'flex', 
                  flexDirection: 'column', 
                  gap: 'var(--spacing-xs)',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--text-secondary)',
                }}>
                  <div>
                    <strong>Job Family:</strong> {getJobFamilyByValue(resume.job_family)?.label || resume.job_family || '-'}
                  </div>
                  <div>
                    <strong>Level:</strong> {resume.level || '-'}
                  </div>
                </div>
              </div>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column',
                gap: 'var(--spacing-sm)',
              }}>
                <Link href={`/edit-resume/${resume.id}`} style={{ width: '100%' }}>
                  <Button variant="outline" fullWidth size="sm">Edit</Button>
                </Link>
                <Link href={`/resume-manager/${resume.id}/copilot`} style={{ width: '100%' }}>
                  <Button variant="secondary" fullWidth size="sm">Resume Copilot ✨</Button>
                </Link>
                <Button
                  variant="ghost"
                  fullWidth
                  size="sm"
                  onClick={() => handleViewClick(resume.file_url, resume)}
                >
                  View Resume
                </Button>
                <Button
                  variant="danger"
                  fullWidth
                  size="sm"
                  onClick={() => handleDeleteClick(resume.id)}
                  disabled={deleting === resume.id}
                >
                  {deleting === resume.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        // Desktop Table Layout
        <Card padding="none" style={{ overflowX: 'auto' }}>
          <table style={tableStyle} aria-label="My resumes - name, job family, level, and actions">
            <thead>
              <tr>
                <th style={thStyle} scope="col">Name</th>
                <th style={thStyle} scope="col">Job Family</th>
                <th style={thStyle} scope="col">Level</th>
                <th style={thStyle} scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedResumes.map((resume) => (
                <tr 
                  key={resume.id} 
                  style={{
                    transition: 'background-color var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-gray-50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={tdStyle}>{resume.name || '-'}</td>
                  <td style={tdStyle}>{getJobFamilyByValue(resume.job_family)?.label || resume.job_family || '-'}</td>
                  <td style={tdStyle}>{resume.level || '-'}</td>
                  <td style={{ ...tdStyle, display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'center' }}>
                    <Link href={`/edit-resume/${resume.id}`}>
                      <Button variant="outline" size="sm">Edit</Button>
                    </Link>
                    <Link href={`/resume-manager/${resume.id}/copilot`}>
                      <Button variant="secondary" size="sm">✨ Copilot</Button>
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewClick(resume.file_url, resume);
                      }}
                    >
                      View
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDeleteClick(resume.id)}
                      disabled={deleting === resume.id}
                    >
                      {deleting === resume.id ? 'Deleting...' : 'Delete'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {resumes.length > itemsPerPage && (() => {
        const getPageWindow = () => {
          if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
          if (currentPage <= 3) return [1, 2, 3, 4, 5];
          if (currentPage >= totalPages - 2) return [totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
          return [currentPage - 2, currentPage - 1, currentPage, currentPage + 1, currentPage + 2];
        };
        const pageNumbers = getPageWindow();
        const showLast = totalPages > 5 && pageNumbers[pageNumbers.length - 1] < totalPages;
        const paginationBtnStyle = (active) => ({
          minWidth: '28px',
          height: '28px',
          padding: '0 var(--spacing-xs)',
          fontSize: 'var(--font-size-xs)',
          fontWeight: active ? 'var(--font-weight-semibold)' : 'var(--font-weight-medium)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 'var(--border-radius-sm)',
          border: `1px solid ${active ? 'var(--color-primary)' : 'var(--border-color)'}`,
          background: active ? 'var(--color-primary)' : 'var(--bg-primary)',
          color: active ? 'var(--text-inverse)' : 'var(--text-primary)',
          cursor: 'pointer',
          textDecoration: 'none',
          transition: 'all var(--transition-fast)',
        });
        return (
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 'var(--spacing-xs)',
            marginTop: 'var(--spacing-lg)',
            flexWrap: 'wrap',
          }}>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              aria-label="Previous page"
              style={{
                ...paginationBtnStyle(false),
                cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
                opacity: currentPage === 1 ? 0.5 : 1,
              }}
            >
              Prev
            </button>
            {pageNumbers.map((pageNum) => (
              <button
                key={pageNum}
                type="button"
                onClick={() => setCurrentPage(pageNum)}
                style={paginationBtnStyle(currentPage === pageNum)}
                aria-current={currentPage === pageNum ? 'page' : undefined}
              >
                {pageNum}
              </button>
            ))}
            {showLast && (
              <>
                <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-muted)', padding: '0 var(--spacing-xs)' }}>…</span>
                <button
                  type="button"
                  onClick={() => setCurrentPage(totalPages)}
                  aria-label="Last page"
                  style={paginationBtnStyle(currentPage === totalPages)}
                >
                  Last
                </button>
              </>
            )}
            <span style={{
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-muted)',
              marginLeft: 'var(--spacing-sm)',
            }}>
              {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              aria-label="Next page"
              style={{
                ...paginationBtnStyle(false),
                cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
                opacity: currentPage === totalPages ? 0.5 : 1,
              }}
            >
              Next
            </button>
          </div>
        );
      })()}

      <PDFModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedResume(null);
        }}
        fileUrl={selectedFileURL}
        resumeData={selectedResume}
      />

      <ConfirmationModal
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false);
          setResumeToDelete(null);
        }}
        onConfirm={handleDeleteConfirm}
        title="Delete Resume"
        message="Are you sure you want to delete this resume? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}

      {showBackToTop && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Back to top"
          style={{
            position: 'fixed',
            bottom: 'var(--spacing-lg)',
            right: 'var(--spacing-lg)',
            zIndex: 'var(--z-fixed)',
          }}
        >
          Back to top
        </Button>
      )}
    </div>
  );
}
