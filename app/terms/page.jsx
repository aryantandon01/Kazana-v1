import Link from 'next/link';
import Card from '@/components/Card';

export const metadata = {
  title: 'Terms of Service — Kazana',
};

export default function TermsPage() {
  return (
    <div className="container" style={{ paddingTop: 'var(--spacing-xl)', paddingBottom: 'var(--spacing-xl)', maxWidth: 'var(--container-md)' }}>
      <Card style={{ padding: 'var(--spacing-xl)' }}>
        <h1>Terms of Service</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          By using Kazana, you agree to these terms. A complete legal document will be published before public launch.
        </p>
        <h2>Acceptable use</h2>
        <ul style={{ color: 'var(--text-secondary)', paddingLeft: 'var(--spacing-lg)' }}>
          <li>Upload only resumes you have the right to share</li>
          <li>Do not upload sensitive personal data of others without consent</li>
          <li>Use job listings for personal job search purposes</li>
        </ul>
        <h2>Disclaimer</h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Kazana provides informational content. We do not guarantee hiring outcomes.
        </p>
        <p style={{ marginTop: 'var(--spacing-lg)' }}>
          <Link href="/">← Back to home</Link>
        </p>
      </Card>
    </div>
  );
}
