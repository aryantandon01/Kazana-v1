'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { useRouter } from 'next/navigation';
import Card from '@/components/Card';
import Input from '@/components/Input';
import Button from '@/components/Button';
import Alert from '@/components/Alert';
import Toast from '@/components/Toast';

export default function Login() {
  const { user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  async function handleEmailLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    } else {
      router.push('/resume-manager');
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    if (error) {
      setError(error.message);
      setLoading(false);
    }
  }

  async function handleSignUp() {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setError(error.message);
    } else {
      setError(null);
      setToast({ message: 'Check your email to confirm your account!', variant: 'success' });
    }
    setLoading(false);
  }

  if (user) {
    return (
      <div className="container" style={{ paddingTop: 'var(--spacing-2xl)' }}>
        <Card>
          <p>You are logged in as <strong>{user.email}</strong></p>
          <Button
            variant="outline"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.reload();
            }}
          >
            Log out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container" style={{ 
      maxWidth: 'var(--container-sm)',
      paddingTop: 'var(--spacing-2xl)',
      paddingBottom: 'var(--spacing-2xl)',
    }}>
      <Card padding="xl">
        <h2 style={{ marginBottom: 'var(--spacing-xl)', textAlign: 'center' }}>Login</h2>
        
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleEmailLogin} style={{ marginBottom: 'var(--spacing-lg)' }}>
          <Input
            type="email"
            label="Email"
            placeholder="Enter your email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            type="password"
            label="Password"
            placeholder="Enter your password"
            value={password}
            required
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
            <Button
              type="submit"
              variant="outline"
              fullWidth
              disabled={loading}
            >
              {loading ? 'Logging in...' : 'Log in'}
            </Button>
          </div>
        </form>

        <div style={{ 
          borderTop: '1px solid var(--border-color)', 
          paddingTop: 'var(--spacing-lg)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--spacing-sm)',
        }}>
          <Button 
            variant="outline" 
            fullWidth 
            onClick={handleSignUp}
            disabled={loading}
          >
            Sign up (email)
          </Button>
          <Button 
            variant="outline" 
            fullWidth 
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {loading ? 'Logging in...' : 'Log in with Google'}
          </Button>
        </div>
      </Card>
      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
