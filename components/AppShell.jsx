'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import OnboardingTour from '@/components/OnboardingTour';

const PDFModal = dynamic(() => import('@/components/PDFModal'), { ssr: false });

export default function AppShell({ children }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fileUrl, setFileUrl] = useState(null);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'var(--bg-secondary)',
      }}
    >
      <a href="#main" className="skip-to-main">
        Skip to main content
      </a>
      <Header />
      <main id="main" style={{ flex: 1, minHeight: 0 }}>
        {children}
      </main>
      <PDFModal
        isOpen={isModalOpen}
        onRequestClose={() => {
          setIsModalOpen(false);
          setFileUrl(null);
        }}
        fileUrl={fileUrl}
      />
      <OnboardingTour />
      <Footer />
    </div>
  );
}
