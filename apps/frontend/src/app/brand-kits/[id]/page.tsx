'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BrandKitEditorForm } from '@/components/brand-kit/BrandKitEditorForm';
import { BrandKitDto } from '@sbloom/contracts';

function EditBrandKitContent() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [brandKit, setBrandKit] = useState<BrandKitDto | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchBrandKit();
  }, [id]);

  const fetchBrandKit = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bff/brand-kits/${id}`);
      if (!res.ok) {
        throw new Error('Failed to load Brand Kit');
      }
      const data: BrandKitDto = await res.json();
      setBrandKit(data);
    } catch (err) {
      console.error('Error fetching Brand Kit:', err);
      alert('Could not find the requested Brand Kit.');
      router.push('/brand-kits');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto py-12 px-4 animate-pulse space-y-6">
        <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
        <div className="h-96 bg-slate-200 rounded-2xl"></div>
      </div>
    );
  }

  if (!brandKit) {
    return null;
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BrandKitEditorForm initialData={brandKit} isNew={false} />
    </div>
  );
}

export default function EditBrandKitPage() {
  return (
    <React.Suspense
      fallback={
        <div className="max-w-5xl mx-auto py-12 px-4 animate-pulse space-y-6">
          <div className="h-12 bg-slate-200 rounded-xl w-1/3"></div>
          <div className="h-96 bg-slate-200 rounded-2xl"></div>
        </div>
      }
    >
      <EditBrandKitContent />
    </React.Suspense>
  );
}
