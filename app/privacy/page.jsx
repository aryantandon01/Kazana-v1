import Link from 'next/link';
import Card from '@/components/Card';

export const metadata = {
  title: 'Privacy Policy — Kazana',
};

export default function PrivacyPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-xl)', paddingBottom: 'var(--spacing-xl)', maxWidth: 'var(--container-md)' }}>
      <Card style={{ padding: 'var(--spacing-xl)' }}>
        <h1>Privacy Policy</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Kazana respects your privacy. This page will be updated with our full privacy policy before public launch.
        </p>
        <h2>What we collect</h2>
        <ul style={{ color: 'var(--text-secondary)', paddingLeft: 'var(--spacing-lg)' }}>
          <li>Account information (email) when you sign up</li>
          <li>Resume metadata and PDF files you upload</li>
          <li>Usage data to improve the product</li>
        </ul>
        <h2>Your data</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Resume names are private and visible only to you. Other resume fields may be shown publicly on Discover.
        </p>
        <p style={{ marginTop: 'var(--spacing-lg)' }}>
          <Link href="/">← Back to home</Link>
        </p>
      </Card>
    </div>
  );
}
