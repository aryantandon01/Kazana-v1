'use client';

import { AuthProvider } from '@/context/AuthContext';
import { CreditsProvider } from '@/context/CreditsContext';

export default function Providers({ children }) {
  return (
    <AuthProvider>
      <CreditsProvider>{children}</CreditsProvider>
    </AuthProvider>
  );
}
