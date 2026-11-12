'use client';

import React from 'react';
import { BrandKitEditorForm } from '@/components/brand-kit/BrandKitEditorForm';

export default function NewBrandKitPage() {
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
      <BrandKitEditorForm isNew={true} />
    </div>
  );
}
