'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/library');
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center">
      <div className="text-slate-500 text-sm">Redirecting to Library...</div>
    </div>
  );
}
