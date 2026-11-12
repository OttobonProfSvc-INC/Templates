'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { BrandKitDto, CreateBrandKitRequest, UpdateBrandKitRequest } from '@sbloom/contracts';

interface BrandKitEditorFormProps {
  initialData?: BrandKitDto | null;
  isNew?: boolean;
}

const POPULAR_FONTS = [
  'Inter, sans-serif',
  'Outfit, sans-serif',
  'Montserrat, sans-serif',
  'Roboto, sans-serif',
  'Poppins, sans-serif',
  'Cinzel, serif',
  'Playfair Display, serif',
  'Open Sans, sans-serif',
  'Lato, sans-serif',
];

export function BrandKitEditorForm({ initialData, isNew = false }: BrandKitEditorFormProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'basic' | 'logos' | 'colors' | 'contact' | 'business'>('basic');
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState(initialData?.name || '');
  const [shortName, setShortName] = useState(initialData?.shortName || '');
  const [tagline, setTagline] = useState(initialData?.tagline || '');
  const [description, setDescription] = useState(initialData?.description || '');

  // Logos
  const [logos, setLogos] = useState({
    primary: initialData?.logoAssets?.primary || '',
    secondary: initialData?.logoAssets?.secondary || '',
    icon: initialData?.logoAssets?.icon || '',
    darkVariant: initialData?.logoAssets?.darkVariant || '',
    lightVariant: initialData?.logoAssets?.lightVariant || '',
  });

  // Colors
  const [colors, setColors] = useState({
    primary: initialData?.colors?.primary || '#2563eb',
    secondary: initialData?.colors?.secondary || '#0f172a',
    accent: initialData?.colors?.accent || '#10b981',
    background: initialData?.colors?.background || '#ffffff',
    text: initialData?.colors?.text || '#0f172a',
  });

  // Typography
  const [typography, setTypography] = useState({
    primaryFont: initialData?.typography?.primaryFont || 'Inter, sans-serif',
    secondaryFont: initialData?.typography?.secondaryFont || 'Inter, sans-serif',
  });

  // Contact
  const [contact, setContact] = useState({
    phone: initialData?.contact?.phone || '',
    alternatePhone: initialData?.contact?.alternatePhone || '',
    email: initialData?.contact?.email || '',
    website: initialData?.contact?.website || '',
    address: initialData?.contact?.address || '',
  });

  // Social
  const [social, setSocial] = useState({
    instagram: initialData?.socialLinks?.instagram || '',
    facebook: initialData?.socialLinks?.facebook || '',
    linkedin: initialData?.socialLinks?.linkedin || '',
    youtube: initialData?.socialLinks?.youtube || '',
    twitter: initialData?.socialLinks?.twitter || '',
  });

  // Business
  const [business, setBusiness] = useState({
    ctaText: initialData?.business?.ctaText || '',
    ctaUrl: initialData?.business?.ctaUrl || '',
    whatsapp: initialData?.business?.whatsapp || '',
  });

  const handleFileUpload = async (slot: keyof typeof logos, file: File) => {
    if (!file) return;
    setUploadingSlot(slot);

    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64Content = e.target?.result as string;

        // If we have an existing brand kit ID, upload through BFF to bucket
        if (initialData?.id) {
          try {
            const res = await fetch(`/api/bff/brand-kits/${initialData.id}/logos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slot,
                fileBase64: base64Content,
                fileName: file.name,
                contentType: file.type || 'image/png',
              }),
            });
            if (res.ok) {
              const result = await res.json();
              setLogos((prev) => ({ ...prev, [slot]: result.logoUrl }));
              return;
            }
          } catch {
            // fallback to local data url
          }
        }

        // Default or new kit: save base64 data URL
        setLogos((prev) => ({ ...prev, [slot]: base64Content }));
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('File read error:', err);
      alert('Could not read logo image file.');
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Brand or organization name is required.');
      return;
    }

    setSaving(true);
    try {
      const payload: CreateBrandKitRequest | UpdateBrandKitRequest = {
        name: name.trim(),
        shortName: shortName.trim() || undefined,
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        colors,
        typography,
        contact,
        socialLinks: social,
        logoAssets: logos,
        business,
      };

      const url = isNew ? '/api/bff/brand-kits' : `/api/bff/brand-kits/${initialData?.id}`;
      const method = isNew ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || errJson.error || 'Failed to save Brand Kit');
      }

      router.push('/brand-kits');
    } catch (err: any) {
      console.error('Save error:', err);
      alert(`Could not save Brand Kit: ${err.message || err}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSave} className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Top Banner & Header */}
      <div className="p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-50/50">
        <div className="flex items-center gap-4">
          <div
            className="w-14 h-14 rounded-xl border border-slate-200 shadow-xs flex items-center justify-center p-1.5 overflow-hidden bg-white shrink-0"
          >
            {logos.primary || logos.icon ? (
              <img
                src={logos.primary || logos.icon}
                alt="Brand Logo"
                className="w-full h-full object-contain"
              />
            ) : (
              <div
                className="w-full h-full rounded-lg flex items-center justify-center font-bold text-white text-base"
                style={{ backgroundColor: colors.primary }}
              >
                {name ? name.substring(0, 2).toUpperCase() : 'BK'}
              </div>
            )}
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isNew ? 'Create New Brand Kit' : `Edit: ${name || 'Brand Kit'}`}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Set standard logos, brand colors, typography, contact, and social details.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/brand-kits">
            <Button variant="outline" size="sm" type="button" className="text-xs">
              Cancel
            </Button>
          </Link>
          <Button
            id="btn-save-brand-kit"
            size="sm"
            type="submit"
            disabled={saving}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs px-5 shadow-xs"
          >
            {saving ? 'Saving...' : isNew ? 'Create Brand Kit' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex border-b border-slate-200 px-6 gap-6 bg-white overflow-x-auto">
        {[
          { key: 'basic', label: 'Basic Info' },
          { key: 'logos', label: 'Logos & Assets' },
          { key: 'colors', label: 'Colors & Typography' },
          { key: 'contact', label: 'Contact & Social' },
          { key: 'business', label: 'Business & CTA' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            id={`tab-${tab.key}`}
            onClick={() => setActiveTab(tab.key as any)}
            className={`py-3 text-xs font-semibold whitespace-nowrap transition-colors border-b-2 -mb-px ${
              activeTab === tab.key
                ? 'border-indigo-600 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Panels */}
      <div className="p-6">
        {/* 1. BASIC INFO */}
        {activeTab === 'basic' && (
          <div className="space-y-5 max-w-2xl">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Brand / Organization Name <span className="text-rose-500">*</span>
              </label>
              <input
                id="input-brand-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Kavety Multispeciality Hospital"
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Short Name / Acronym
              </label>
              <input
                id="input-brand-short-name"
                type="text"
                value={shortName}
                onChange={(e) => setShortName(e.target.value)}
                placeholder="e.g. Kavety Hospital"
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tagline / Slogan
              </label>
              <input
                id="input-brand-tagline"
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Excellence in Healthcare & Compassionate Care"
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Description / Mission
              </label>
              <textarea
                id="input-brand-description"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief summary of the brand, services, or organization background..."
                className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
              />
            </div>
          </div>
        )}

        {/* 2. LOGO ASSETS */}
        {activeTab === 'logos' && (
          <div className="space-y-6 max-w-3xl">
            <p className="text-xs text-slate-500">
              Provide logo assets for light/dark backgrounds and social post badges. You can upload files or paste image URLs.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { slot: 'primary', label: 'Primary Logo (Horizontal/Full)', desc: 'Used for website navbar and main post headers.' },
                { slot: 'secondary', label: 'Secondary Logo', desc: 'Alternate version for footers or dark backgrounds.' },
                { slot: 'icon', label: 'Icon / Brand Mark', desc: 'Square favicon or social profile avatar badge.' },
                { slot: 'darkVariant', label: 'Dark Variant Logo', desc: 'Optimized for light backgrounds.' },
                { slot: 'lightVariant', label: 'Light Variant Logo', desc: 'Optimized for dark backgrounds.' },
              ].map(({ slot, label, desc }) => {
                const s = slot as keyof typeof logos;
                const value = logos[s];

                return (
                  <div key={slot} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-slate-800">{label}</h4>
                        <p className="text-[11px] text-slate-500">{desc}</p>
                      </div>
                      {value && (
                        <div className="w-14 h-14 bg-white border border-slate-200 rounded-lg p-1 shrink-0 flex items-center justify-center overflow-hidden shadow-xs">
                          <img src={value} alt={label} className="w-full h-full object-contain" />
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <input
                        id={`input-logo-${slot}`}
                        type="text"
                        placeholder="Image URL or upload file..."
                        value={value}
                        onChange={(e) => setLogos((prev) => ({ ...prev, [s]: e.target.value }))}
                        className="w-full text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 focus:ring-2 focus:ring-indigo-500 text-slate-800"
                      />

                      <div className="flex items-center gap-2">
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-300 hover:bg-slate-50 rounded text-xs font-medium text-slate-700 shadow-xs">
                          <span>📁 Upload Image</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleFileUpload(s, f);
                            }}
                          />
                        </label>
                        {uploadingSlot === slot && <span className="text-xs text-indigo-600">Uploading...</span>}
                        {value && (
                          <button
                            type="button"
                            onClick={() => setLogos((prev) => ({ ...prev, [s]: '' }))}
                            className="text-xs text-slate-400 hover:text-rose-600 ml-auto"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. COLORS & TYPOGRAPHY */}
        {activeTab === 'colors' && (
          <div className="space-y-8 max-w-3xl">
            {/* Color Palette */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Color Palette</h3>
              <p className="text-xs text-slate-500 mb-4">
                Define the primary, secondary, and accent colors to automatically brand social posts and websites.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: 'primary', label: 'Primary Brand Color', desc: 'Main brand shade, buttons, headers.' },
                  { key: 'secondary', label: 'Secondary Brand Color', desc: 'Footer, accents, background contrast.' },
                  { key: 'accent', label: 'Accent Color', desc: 'Highlights, badges, CTAs.' },
                  { key: 'background', label: 'Background Color', desc: 'Page canvas background.' },
                  { key: 'text', label: 'Text Color', desc: 'Primary typography color.' },
                ].map(({ key, label, desc }) => {
                  const k = key as keyof typeof colors;
                  const val = colors[k];

                  return (
                    <div key={key} className="border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800">{label}</span>
                        <div
                          className="w-5 h-5 rounded-full border border-slate-300 shadow-xs"
                          style={{ backgroundColor: val }}
                        />
                      </div>
                      <p className="text-[10px] text-slate-500">{desc}</p>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={val.startsWith('#') && val.length === 7 ? val : '#2563eb'}
                          onChange={(e) => setColors((prev) => ({ ...prev, [k]: e.target.value }))}
                          className="w-8 h-8 rounded border border-slate-300 cursor-pointer p-0.5 bg-white"
                        />
                        <input
                          id={`input-color-${key}`}
                          type="text"
                          value={val}
                          onChange={(e) => setColors((prev) => ({ ...prev, [k]: e.target.value }))}
                          className="w-full text-xs font-mono bg-white border border-slate-300 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 text-slate-800"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Typography */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Typography</h3>
              <p className="text-xs text-slate-500 mb-4">
                Choose primary and secondary font families for headings and body content.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Primary Font (Headings)
                  </label>
                  <select
                    id="select-primary-font"
                    value={typography.primaryFont}
                    onChange={(e) => setTypography((prev) => ({ ...prev, primaryFont: e.target.value }))}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900 mb-2"
                  >
                    {POPULAR_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <input
                    id="input-primary-font-custom"
                    type="text"
                    value={typography.primaryFont}
                    onChange={(e) => setTypography((prev) => ({ ...prev, primaryFont: e.target.value }))}
                    placeholder="Custom font family..."
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800"
                  />
                  <div
                    className="mt-2 p-2 bg-slate-100 rounded text-sm text-slate-800"
                    style={{ fontFamily: typography.primaryFont }}
                  >
                    Preview: {name || 'The Quick Brown Fox Jumps Over The Lazy Dog'}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Secondary Font (Body Text)
                  </label>
                  <select
                    id="select-secondary-font"
                    value={typography.secondaryFont}
                    onChange={(e) => setTypography((prev) => ({ ...prev, secondaryFont: e.target.value }))}
                    className="w-full text-xs bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900 mb-2"
                  >
                    {POPULAR_FONTS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                  <input
                    id="input-secondary-font-custom"
                    type="text"
                    value={typography.secondaryFont}
                    onChange={(e) => setTypography((prev) => ({ ...prev, secondaryFont: e.target.value }))}
                    placeholder="Custom font family..."
                    className="w-full text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-slate-800"
                  />
                  <div
                    className="mt-2 p-2 bg-slate-100 rounded text-xs text-slate-600"
                    style={{ fontFamily: typography.secondaryFont }}
                  >
                    Preview: Modern typography elevates brand trust and conversion rates.
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 4. CONTACT & SOCIAL */}
        {activeTab === 'contact' && (
          <div className="space-y-8 max-w-3xl">
            {/* Contact Details */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Contact Information</h3>
              <p className="text-xs text-slate-500 mb-4">
                These contact details will populate contact sections, cards, and footer widgets.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    id="input-contact-phone"
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={contact.phone}
                    onChange={(e) => setContact((prev) => ({ ...prev, phone: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Alternate Phone</label>
                  <input
                    id="input-contact-alt-phone"
                    type="text"
                    placeholder="e.g. +91 98765 43211"
                    value={contact.alternatePhone}
                    onChange={(e) => setContact((prev) => ({ ...prev, alternatePhone: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email Address</label>
                  <input
                    id="input-contact-email"
                    type="email"
                    placeholder="e.g. care@kavetyhospital.com"
                    value={contact.email}
                    onChange={(e) => setContact((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Website URL</label>
                  <input
                    id="input-contact-website"
                    type="text"
                    placeholder="e.g. https://kavetyhospital.com"
                    value={contact.website}
                    onChange={(e) => setContact((prev) => ({ ...prev, website: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Physical Address</label>
                  <textarea
                    id="input-contact-address"
                    rows={2}
                    placeholder="e.g. 123 Healthcare Boulevard, Tech City"
                    value={contact.address}
                    onChange={(e) => setContact((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="pt-6 border-t border-slate-200">
              <h3 className="text-sm font-bold text-slate-900 mb-1">Social Media Profiles</h3>
              <p className="text-xs text-slate-500 mb-4">
                Links mapped to social footer buttons, cards, and post handles.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'instagram', label: 'Instagram', icon: '📸', placeholder: 'https://instagram.com/kavetyhospital' },
                  { key: 'facebook', label: 'Facebook', icon: '📘', placeholder: 'https://facebook.com/kavetyhospital' },
                  { key: 'linkedin', label: 'LinkedIn', icon: '💼', placeholder: 'https://linkedin.com/company/kavetyhospital' },
                  { key: 'twitter', label: 'X / Twitter', icon: '🐦', placeholder: 'https://x.com/kavetyhospital' },
                  { key: 'youtube', label: 'YouTube', icon: '▶️', placeholder: 'https://youtube.com/@kavetyhospital' },
                ].map(({ key, label, icon, placeholder }) => {
                  const k = key as keyof typeof social;
                  return (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        <span className="mr-1.5">{icon}</span> {label}
                      </label>
                      <input
                        id={`input-social-${key}`}
                        type="text"
                        placeholder={placeholder}
                        value={social[k]}
                        onChange={(e) => setSocial((prev) => ({ ...prev, [k]: e.target.value }))}
                        className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* 5. BUSINESS & CTA */}
        {activeTab === 'business' && (
          <div className="space-y-6 max-w-2xl">
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-1">Call-To-Action (CTA) Information</h3>
              <p className="text-xs text-slate-500 mb-4">
                Standard action buttons used in banners, hero sections, and promotional posts.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary CTA Button Text</label>
                  <input
                    id="input-business-cta-text"
                    type="text"
                    placeholder="e.g. Book Appointment, Get Started, Enroll Now"
                    value={business.ctaText}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, ctaText: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Primary CTA Destination URL</label>
                  <input
                    id="input-business-cta-url"
                    type="text"
                    placeholder="e.g. https://kavetyhospital.com/appointment"
                    value={business.ctaUrl}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, ctaUrl: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">WhatsApp Business Number</label>
                  <input
                    id="input-business-whatsapp"
                    type="text"
                    placeholder="e.g. +91 98765 43210"
                    value={business.whatsapp}
                    onChange={(e) => setBusiness((prev) => ({ ...prev, whatsapp: e.target.value }))}
                    className="w-full text-sm bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </form>
  );
}
