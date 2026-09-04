'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import ConfirmationModal from '@/components/ConfirmationModal';
import CreditBadge from '@/components/CreditBadge';

export default function Header() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    closeMenu();
  }, [pathname, closeMenu]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeMenu();
    };

    const onPointerDown = (event) => {
      const target = event.target;
      if (
        menuRef.current?.contains(target) ||
        buttonRef.current?.contains(target)
      ) {
        return;
      }
      closeMenu();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
    };
  }, [menuOpen, closeMenu]);

  const isActive = (path) => {
    if (path === '/') return pathname === '/';
    return pathname.startsWith(path);
  };

  const menuItems = user
    ? [
        { href: '/reports', label: 'Experiences' },
        { href: '/add-resume', label: 'Add Resume' },
        { href: '/resume-manager', label: 'My Resumes' },
        { href: '/settings', label: 'Settings' },
      ]
    : [{ href: '/login', label: 'Login' }];

  return (
    <header style={headerStyle}>
      <div style={containerStyle}>
        <Link
          href="/"
          style={{
            color: 'var(--text-inverse)',
            textDecoration: 'none',
            fontSize: 'var(--font-size-xl)',
            fontWeight: 'var(--font-weight-bold)',
          }}
        >
          Kazana
        </Link>

        <nav aria-label="Primary" style={primaryNavStyle}>
          <Link href="/discover" style={getPrimaryLinkStyle(isActive('/discover'))}>
            Discover
          </Link>
          <Link href="/jobs" style={getPrimaryLinkStyle(isActive('/jobs'))}>
            Jobs
          </Link>

          {user && <CreditBadge />}

          <div style={menuAnchorStyle}>
            <button
              ref={buttonRef}
              type="button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="site-nav-menu"
              onClick={() => setMenuOpen((open) => !open)}
              style={hamburgerButtonStyle}
            >
              <span style={barStyle(menuOpen, 'top')} />
              <span style={barStyle(menuOpen, 'mid')} />
              <span style={barStyle(menuOpen, 'bot')} />
            </button>

            {menuOpen && (
              <div
                id="site-nav-menu"
                ref={menuRef}
                role="navigation"
                aria-label="Account"
                style={menuPanelStyle}
              >
                {menuItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={getMenuLinkStyle(isActive(item.href))}
                    onClick={closeMenu}
                  >
                    {item.label}
                  </Link>
                ))}
                {user && (
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      setShowLogoutConfirm(true);
                    }}
                    style={{
                      ...getMenuLinkStyle(false),
                      background: 'none',
                      border: 'none',
                      width: '100%',
                      textAlign: 'left',
                      cursor: 'pointer',
                      font: 'inherit',
                    }}
                  >
                    Logout
                  </button>
                )}
              </div>
            )}
          </div>
        </nav>
      </div>

      <ConfirmationModal
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Log out"
        message="Are you sure you want to log out?"
        confirmText="Yes"
        cancelText="No"
        variant="danger"
      />
    </header>
  );
}

const headerStyle = {
  backgroundColor: 'var(--bg-dark)',
  color: 'var(--text-inverse)',
  padding: '14px 0',
  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
  position: 'sticky',
  top: 0,
  zIndex: 'var(--z-sticky)',
};

const containerStyle = {
  maxWidth: 'var(--container-lg)',
  margin: '0 auto',
  padding: '0 var(--page-gutter)',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const primaryNavStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--spacing-xl)',
};

const navItemMetrics = {
  fontSize: 'var(--font-size-base)',
  lineHeight: 1.25,
  height: '1.25em',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingBottom: '2px',
  borderBottom: '2px solid transparent',
};

function getPrimaryLinkStyle(active) {
  return {
    ...navItemMetrics,
    color: 'var(--text-inverse)',
    textDecoration: 'none',
    fontWeight: active ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
    borderBottomColor: active ? 'var(--text-inverse)' : 'transparent',
  };
}

const menuAnchorStyle = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  height: '1.25em',
};

const hamburgerButtonStyle = {
  ...navItemMetrics,
  width: '1.25em',
  padding: 0,
  margin: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  cursor: 'pointer',
  flexDirection: 'column',
  gap: '0.2em',
};

function barStyle(open, position) {
  const base = {
    display: 'block',
    width: '1em',
    height: '1.5px',
    backgroundColor: 'var(--text-inverse)',
    borderRadius: '1px',
    transition: 'transform var(--transition-fast), opacity var(--transition-fast)',
    flexShrink: 0,
  };

  if (!open) return base;

  if (position === 'top') {
    return { ...base, transform: 'translateY(calc(0.2em + 1.5px)) rotate(45deg)' };
  }
  if (position === 'mid') {
    return { ...base, opacity: 0 };
  }
  return { ...base, transform: 'translateY(calc(-0.2em - 1.5px)) rotate(-45deg)' };
}

const menuPanelStyle = {
  position: 'absolute',
  top: 'calc(100% + var(--spacing-sm))',
  right: 0,
  minWidth: '220px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: 'var(--spacing-sm)',
  backgroundColor: 'var(--bg-dark)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 'var(--border-radius-sm)',
  boxShadow: 'var(--shadow-lg)',
  zIndex: 'var(--z-dropdown, 1000)',
};

function getMenuLinkStyle(active) {
  return {
    color: 'var(--text-inverse)',
    textDecoration: 'none',
    fontSize: 'var(--font-size-base)',
    fontWeight: active ? 'var(--font-weight-bold)' : 'var(--font-weight-medium)',
    padding: 'var(--spacing-sm) var(--spacing-md)',
    borderRadius: 'var(--border-radius-sm)',
    backgroundColor: active ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
  };
}
