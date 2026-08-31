'use client';

import React, { useEffect, useRef } from 'react';
import Button from '@/components/Button';

const FOCUSABLE_SELECTOR = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export default function ConfirmationModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title = "Confirm Action",
  message = "Are you sure you want to proceed?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger" // danger, warning, info
}) {
  const modalRef = useRef(null);
  const previousActiveRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    previousActiveRef.current = document.activeElement;
    const focusable = modalRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
    const first = focusable?.[0];
    if (first?.focus) first.focus();
    return () => {
      if (previousActiveRef.current?.focus) previousActiveRef.current.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
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
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 'var(--z-modal-backdrop)',
    padding: 'var(--spacing-md)',
  };

  const modalStyle = {
    backgroundColor: 'var(--bg-primary)',
    borderRadius: 'var(--border-radius-lg)',
    padding: 'var(--spacing-xl)',
    maxWidth: '500px',
    width: '100%',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 'var(--z-modal)',
  };

  const titleStyle = {
    fontSize: 'var(--font-size-xl)',
    fontWeight: 'var(--font-weight-bold)',
    marginBottom: 'var(--spacing-md)',
    color: 'var(--text-primary)',
  };

  const messageStyle = {
    fontSize: 'var(--font-size-base)',
    color: 'var(--text-secondary)',
    marginBottom: 'var(--spacing-xl)',
    lineHeight: 'var(--line-height-relaxed)',
  };

  const buttonContainerStyle = {
    display: 'flex',
    gap: 'var(--spacing-md)',
    justifyContent: 'flex-end',
  };

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div 
      style={overlayStyle}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      aria-describedby="modal-message"
    >
      <div 
        ref={modalRef}
        style={modalStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="modal-title" style={titleStyle}>{title}</h2>
        <p id="modal-message" style={messageStyle}>{message}</p>
        <div style={buttonContainerStyle}>
          <Button 
            variant="outline" 
            onClick={onClose}
          >
            {cancelText}
          </Button>
          <Button 
            variant={variant}
            onClick={handleConfirm}
          >
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
