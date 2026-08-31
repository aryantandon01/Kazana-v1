'use client';

import Link from 'next/link';
import Tooltip from '@/components/Tooltip';

export default function Footer() {
  const footerStyle = {
    backgroundColor: 'var(--bg-dark)',
    color: 'var(--text-inverse)',
    padding: 'var(--spacing-2xl) 0',
    marginTop: 'auto',
    borderTop: '1px solid rgba(255, 255, 255, 0.06)',
  };

  const containerStyle = {
    maxWidth: 'var(--container-lg)',
    margin: '0 auto',
    padding: '0 var(--page-gutter)',
  };

  const footerContentStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: 'var(--spacing-xl)',
    marginBottom: 'var(--spacing-lg)',
  };

  const sectionStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: 'var(--spacing-sm)',
  };

  const headingStyle = {
    fontSize: 'var(--font-size-base)',
    fontWeight: 'var(--font-weight-semibold)',
    marginBottom: 'var(--spacing-xs)',
    color: 'var(--text-inverse)',
  };

  const linkStyle = {
    color: 'var(--text-inverse)',
    textDecoration: 'none',
    fontSize: 'var(--font-size-sm)',
    opacity: 0.8,
    transition: 'opacity var(--transition-fast)',
  };

  const disabledLinkStyle = {
    ...linkStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
    pointerEvents: 'none',
  };

  const copyrightStyle = {
    textAlign: 'center',
    paddingTop: 'var(--spacing-lg)',
    borderTop: '1px solid var(--color-gray-700)',
    fontSize: 'var(--font-size-sm)',
    color: 'var(--text-inverse)',
    opacity: 0.7,
  };

  return (
    <footer style={footerStyle}>
      <div style={containerStyle}>
        <div style={footerContentStyle}>
          <div style={sectionStyle}>
            <h4 style={headingStyle}>Kazana</h4>
            <p style={{ 
              fontSize: 'var(--font-size-sm)', 
              color: 'var(--text-inverse)', 
              opacity: 0.8,
              margin: 0,
            }}>
              Discover resumes that got past ATS systems. Share your success and help others learn.
            </p>
          </div>

          <div style={sectionStyle}>
            <h4 style={headingStyle}>Navigation</h4>
            <Link href="/" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Home
            </Link>
            <Link href="/discover" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Discover
            </Link>
            <Link href="/jobs" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Jobs
            </Link>
            <Link href="/add-resume" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Add Resume
            </Link>
          </div>

          <div style={sectionStyle}>
            <h4 style={headingStyle}>Legal</h4>
            <Link href="/privacy" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Privacy Policy
            </Link>
            <Link href="/terms" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Terms of Service
            </Link>
            <Tooltip content="Coming soon">
              <span style={disabledLinkStyle}>About</span>
            </Tooltip>
          </div>

          <div style={sectionStyle}>
            <h4 style={headingStyle}>Support</h4>
            <a href="mailto:support@kazana.com" style={linkStyle} onMouseEnter={(e) => e.currentTarget.style.opacity = '1'} onMouseLeave={(e) => e.currentTarget.style.opacity = '0.8'}>
              Contact Us
            </a>
            <Tooltip content="Coming soon">
              <span style={disabledLinkStyle}>FAQ</span>
            </Tooltip>
          </div>
        </div>

        <div style={copyrightStyle}>
          <p style={{ margin: 0 }}>
            &copy; {new Date().getFullYear()} Kazana. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
