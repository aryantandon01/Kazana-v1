'use client';

import React, { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Button from '@/components/Button';
import Card from '@/components/Card';

export default function OnboardingTour({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const pathname = usePathname();

  const steps = [
    {
      title: 'Welcome to Kazana! 👋',
      content: 'Kazana helps you discover resumes that successfully passed ATS systems. Let\'s take a quick tour!',
      position: 'center',
    },
    {
      title: 'Discover Resumes',
      content: 'Browse through successful resumes filtered by companies, job families, levels, and more. Use the filters on the left to find exactly what you\'re looking for.',
      position: 'center',
      route: '/discover',
    },
    {
      title: 'Add Your Resume',
      content: 'Share your successful resume to help others! Select all companies where your resume passed their ATS screening.',
      position: 'center',
      route: '/add-resume',
    },
    {
      title: 'Manage Your Resumes',
      content: 'View, edit, or delete your uploaded resumes from the "My Resumes" page. You can have multiple resumes for different roles.',
      position: 'center',
      route: '/resume-manager',
    },
  ];

  useEffect(() => {
    // Check if user has seen the tour before
    const hasSeenTour = localStorage.getItem('kazana_tour_completed');
    if (!hasSeenTour && pathname === '/') {
      setIsVisible(true);
    }
  }, [pathname]);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    localStorage.setItem('kazana_tour_completed', 'true');
    setIsVisible(false);
    if (onComplete) onComplete();
  };

  if (!isVisible) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 'var(--z-modal-backdrop)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--spacing-md)',
    animation: 'fadeIn var(--animation-duration-base) ease-out',
  };

  const cardStyle = {
    maxWidth: '500px',
    width: '100%',
    zIndex: 'var(--z-modal)',
    animation: 'scaleIn var(--animation-duration-fast) ease-out',
  };

  const currentStepData = steps[currentStep];

  return (
    <div style={overlayStyle} onClick={handleSkip}>
      <div style={cardStyle} onClick={(e) => e.stopPropagation()}>
        <Card padding="xl">
          <h2 style={{ marginBottom: 'var(--spacing-md)' }}>{currentStepData.title}</h2>
          <p style={{ 
            marginBottom: 'var(--spacing-lg)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--line-height-relaxed)',
          }}>
            {currentStepData.content}
          </p>
          
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 'var(--spacing-md)',
          }}>
            <div style={{ display: 'flex', gap: 'var(--spacing-xs)' }}>
              {steps.map((_, index) => (
                <div
                  key={index}
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: index === currentStep 
                      ? 'var(--color-primary)' 
                      : 'var(--color-gray-300)',
                    transition: 'background-color var(--transition-fast)',
                  }}
                />
              ))}
            </div>
            
            <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
              <Button
                variant="ghost"
                onClick={handleSkip}
              >
                Skip
              </Button>
              <Button
                onClick={handleNext}
              >
                {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
