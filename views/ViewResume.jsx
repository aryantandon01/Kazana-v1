'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from "react";
import { apiFetch } from '@/lib/api/client';
import Card from '@/components/Card';
import Alert from '@/components/Alert';
import Loading from '@/components/Loading';
import Breadcrumbs from '@/components/Breadcrumbs';

export default function ViewResume() {
  const { id } = useParams();
  const [fileUrl, setFileUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchResume = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await apiFetch(`/api/resumes/${id}`);
        setFileUrl(data?.file_url || null);
      } catch (err) {
        setError(err.message);
        console.error('Error fetching resume:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchResume();
  }, [id]);

  if (loading) {
    return <Loading message="Loading resume..." />;
  }

  if (error) {
    return (
      <div className="container" style={{ paddingTop: 'var(--spacing-xl)' }}>
        <Alert variant="error">{error}</Alert>
      </div>
    );
  }

  return (
    <div className="container" style={{ 
      paddingTop: 'var(--spacing-xl)',
      paddingBottom: 'var(--spacing-xl)',
    }}>
      <Breadcrumbs
        items={[
          { label: 'Home', to: '/' },
          { label: 'My Resumes', to: '/resume-manager' },
          { label: 'View' },
        ]}
      />
      <Card padding="none" style={{ overflow: 'hidden' }}>
        <div style={{ 
          padding: 'var(--spacing-md)',
          borderBottom: '1px solid var(--border-color)',
          backgroundColor: 'var(--color-gray-50)',
        }}>
          <h2 style={{ margin: 0 }}>Resume Viewer</h2>
        </div>
        {fileUrl ? (
          <iframe
            src={fileUrl}
            title="Resume"
            style={{
              width: '100%',
              height: '90vh',
              minHeight: '600px',
              border: 'none',
            }}
          />
        ) : (
          <div style={{ 
            padding: 'var(--spacing-2xl)',
            textAlign: 'center',
            color: 'var(--text-muted)',
          }}>
            <p>Resume not found.</p>
          </div>
        )}
      </Card>
    </div>
  );
}
