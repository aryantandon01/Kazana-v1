import './globals.css';
import Providers from '@/components/Providers';
import AppShell from '@/components/AppShell';

export const metadata = {
  title: 'Kazana — Career Intelligence',
  description: 'Discover resumes that passed ATS screening and browse job listings.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
