import { Suspense } from 'react';
import Jobs from '@/views/Jobs';
import SkeletonLoader from '@/components/SkeletonLoader';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="container" style={{ paddingTop: 'var(--spacing-3xl)' }}>
          <SkeletonLoader rows={4} variant="card" />
        </div>
      }
    >
      <Jobs />
    </Suspense>
  );
}
