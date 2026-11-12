'use client';

import React, { useState, useRef, ChangeEvent, DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { WebsiteRenderer } from '@/components/website-customizer/WebsiteRenderer';
import { WebsiteZipAnalysis, TemplateDto } from '@sbloom/contracts';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export default function AddAssetPage() {
  const router = useRouter();

  // Primary Asset Type Selector: 'social-post' | 'website-template'
  const [assetType, setAssetType] = useState<'social-post' | 'website-template'>('social-post');

  // ==========================================
  // Social Post Form State
  // ==========================================
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<string>('Coaching');
  const [customCategory, setCustomCategory] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [isCustomizable, setIsCustomizable] = useState<boolean>(false);
  const [width, setWidth] = useState<number>(1080);
  const [height, setHeight] = useState<number>(1350);

  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [fileBase64, setFileBase64] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailBase64, setThumbnailBase64] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<any | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const thumbnailInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // Website Template ZIP Import State
  // ==========================================
  const [websiteTitle, setWebsiteTitle] = useState<string>('');
  const [websiteCategory, setWebsiteCategory] = useState<string>('School');
  const [customWebsiteCategory, setCustomWebsiteCategory] = useState<string>('');
  const [websiteContributor, setWebsiteContributor] = useState<string>('');
  const [websiteDescription, setWebsiteDescription] = useState<string>('');

  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipBase64, setZipBase64] = useState<string | null>(null);
  const [isZipDragging, setIsZipDragging] = useState<boolean>(false);

  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisResult, setAnalysisResult] = useState<WebsiteZipAnalysis | null>(null);
  const [previewViewport, setPreviewViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');

  const [isPublishingWebsite, setIsPublishingWebsite] = useState<boolean>(false);
  const [publishedWebsite, setPublishedWebsite] = useState<TemplateDto | null>(null);

  const zipInputRef = useRef<HTMLInputElement>(null);

  // Social Post File Handling
  const handleFileSelection = (selectedFile: File) => {
    setError(null);
    if (!ALLOWED_MIME_TYPES.includes(selectedFile.type.toLowerCase())) {
      const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setError(`Unsupported file format. Please upload JPG, JPEG, PNG, or WEBP.`);
        return;
      }
    }

    setFile(selectedFile);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setFilePreview(dataUrl);
      setFileBase64(dataUrl);

      const img = new Image();
      img.onload = () => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          setWidth(img.naturalWidth);
          setHeight(img.naturalHeight);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelection(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelection(e.target.files[0]);
    }
  };

  const handleThumbnailInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const tFile = e.target.files[0];
      setThumbnailFile(tFile);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setThumbnailBase64(ev.target?.result as string);
      };
      reader.readAsDataURL(tFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Please provide a title for the master asset.');
      return;
    }

    const finalCategory = category === 'Other' ? customCategory.trim() : category;
    if (!finalCategory) {
      setError('Please select or specify a category.');
      return;
    }

    if (!file || !fileBase64) {
      setError('Please upload a primary asset image file.');
      return;
    }

    if (width <= 0 || height <= 0) {
      setError('Width and height must be positive dimensions.');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || undefined,
        category: finalCategory,
        assetTypeCode: assetType,
        isCustomizable,
        classification: isCustomizable ? 'STRUCTURED_TEMPLATE' : 'FLAT_IMAGE',
        width: Math.round(width),
        height: Math.round(height),
        fileName: file.name,
        mimeType: file.type || 'image/jpeg',
        fileData: fileBase64,
        thumbnailData: thumbnailBase64 || undefined,
      };

      const res = await fetch('/api/bff/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Creation failed with status ${res.status}`);
      }

      const result = await res.json();
      setSuccessResult(result);
    } catch (err: any) {
      console.error('Asset creation error:', err);
      setError(err.message || 'An unexpected error occurred while adding the asset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ==========================================
  // Website Template ZIP Import Handlers
  // ==========================================
  const handleZipSelection = (selectedFile: File) => {
    setError(null);
    if (!selectedFile.name.toLowerCase().endsWith('.zip')) {
      setError('Unsupported file type. Please upload a .zip archive. Executable installers or binary packages are strictly rejected.');
      return;
    }

    setZipFile(selectedFile);
    if (!websiteTitle) {
      const cleanName = selectedFile.name.replace(/\.zip$/i, '').replace(/[-_]+/g, ' ');
      setWebsiteTitle(cleanName.replace(/\b\w/g, (c) => c.toUpperCase()));
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setZipBase64(e.target?.result as string);
    };
    reader.readAsDataURL(selectedFile);
  };

  const handleZipDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsZipDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleZipSelection(e.dataTransfer.files[0]);
    }
  };

  const handleAnalyzeZip = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!zipFile || !zipBase64) {
      setError('Please select a valid .zip website template archive to analyze.');
      return;
    }

    setIsAnalyzing(true);

    try {
      const finalCategory = websiteCategory === 'Other' ? customWebsiteCategory.trim() : websiteCategory;
      const res = await fetch('/api/bff/website-importer/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: zipFile.name,
          fileBase64: zipBase64,
          templateName: websiteTitle.trim() || undefined,
          category: finalCategory || undefined,
          contributor: websiteContributor.trim() || undefined,
          description: websiteDescription.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Analysis failed with status ${res.status}`);
      }

      const data: WebsiteZipAnalysis = await res.json();
      setAnalysisResult(data);
      if (!websiteTitle && data.suggestedTitle) {
        setWebsiteTitle(data.suggestedTitle);
      }
      if (data.suggestedCategory && websiteCategory === 'Other') {
        setWebsiteCategory(data.suggestedCategory);
      }
    } catch (err: any) {
      console.error('ZIP analysis error:', err);
      setError(err.message || 'Failed to inspect website ZIP archive.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handlePublishWebsite = async () => {
    if (!analysisResult) return;
    setError(null);
    setIsPublishingWebsite(true);

    try {
      const finalCategory = websiteCategory === 'Other' ? (customWebsiteCategory.trim() || 'Other') : websiteCategory;
      const finalContributor = websiteContributor.trim() || 'Community Contributor';

      const payload = {
        title: websiteTitle.trim() || analysisResult.suggestedTitle || 'Imported Website Template',
        category: finalCategory,
        contributor: finalContributor,
        description: websiteDescription.trim() || undefined,
        document: analysisResult.normalizedDocument,
        framework: analysisResult.framework,
        sourcePackage: {
          contributor: finalContributor,
          originalPath: zipFile?.name || 'template.zip',
          originalFramework: analysisResult.framework,
          originalTemplateName: websiteTitle.trim() || analysisResult.suggestedTitle,
        },
      };

      const res = await fetch('/api/bff/website-importer/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorJson = await res.json().catch(() => ({}));
        throw new Error(errorJson.error || errorJson.message || `Publishing failed with status ${res.status}`);
      }

      const result: TemplateDto = await res.json();
      setPublishedWebsite(result);
    } catch (err: any) {
      console.error('Website publish error:', err);
      setError(err.message || 'Failed to publish website master template.');
    } finally {
      setIsPublishingWebsite(false);
    }
  };

  const resetForm = () => {
    setSuccessResult(null);
    setPublishedWebsite(null);
    setAnalysisResult(null);
    setTitle('');
    setDescription('');
    setCustomCategory('');
    setFile(null);
    setFilePreview(null);
    setFileBase64(null);
    setThumbnailFile(null);
    setThumbnailBase64(null);
    setZipFile(null);
    setZipBase64(null);
    setWebsiteTitle('');
    setWebsiteDescription('');
    setError(null);
  };

  return (
    <div className="flex flex-col min-h-full space-y-6 max-w-5xl mx-auto pb-16">
      <PageHeader
        title="Add Master Asset"
        description="Ingest a new social post creative or import an existing contributor website ZIP into the sBLOOM master library."
      />

      {/* Asset Type Switcher */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">Select Asset Type:</span>
          <p className="text-xs text-slate-600 mt-0.5">Choose whether to add a social post creative or import a full website template.</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
          <button
            type="button"
            id="asset-type-social"
            onClick={() => {
              setAssetType('social-post');
              setError(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              assetType === 'social-post'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🖼️ Social Post
          </button>
          <button
            type="button"
            id="asset-type-website"
            onClick={() => {
              setAssetType('website-template');
              setError(null);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              assetType === 'website-template'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🌐 Website Template (ZIP)
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div id="add-asset-error" className="bg-red-50 border border-red-200 text-red-800 p-4 rounded-xl text-sm flex items-start gap-3 shadow-sm animate-in fade-in">
          <span className="text-red-600 font-bold text-lg leading-none">!</span>
          <div>
            <p className="font-semibold text-xs sm:text-sm">Import Error</p>
            <p className="text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* 1. WEBSITE TEMPLATE IMPORT WORKFLOW */}
      {/* ============================================================== */}
      {assetType === 'website-template' && (
        <div className="space-y-6">
          {/* Published Success Notification */}
          {publishedWebsite && (
            <div id="website-publish-success" className="bg-emerald-50 border border-emerald-300 rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                  ✓
                </div>
                <div className="flex-grow">
                  <h3 className="text-lg font-bold text-emerald-950">Website Master Template Published Successfully!</h3>
                  <p className="text-sm text-emerald-800 mt-1">
                    The normalized website template is now permanently available in the Template Library for preview and customization.
                  </p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/80 p-4 rounded-xl border border-emerald-200">
                    <div>
                      <span className="font-semibold text-slate-600">Template Title:</span> {publishedWebsite.title}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Category:</span> {publishedWebsite.category}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Contributor:</span> {publishedWebsite.contributor || 'Community'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Framework:</span> {publishedWebsite.framework || 'Normalized HTML'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Sections Count:</span> {(publishedWebsite.document as any)?.page?.sections?.length || 0}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Classification:</span>{' '}
                      <span className="font-semibold text-indigo-700">Structured Website Template</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2 justify-end border-t border-emerald-200">
                <Button id="btn-import-another" variant="outline" onClick={resetForm}>
                  Import Another Template
                </Button>
                <Button
                  id="btn-view-in-library"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => router.push('/library')}
                >
                  View in Template Library →
                </Button>
              </div>
            </div>
          )}

          {/* Import Review Screen (Shown after successful ZIP analysis and before publish) */}
          {analysisResult && !publishedWebsite && (
            <div id="import-review-screen" className="space-y-6 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Import Analysis</span>
                  <h3 className="text-xl font-bold text-slate-900 mt-0.5">{websiteTitle || analysisResult.suggestedTitle}</h3>
                  <p className="text-xs text-slate-500">
                    Review detected framework, sections, and warnings before publishing to the master library.
                  </p>
                </div>

                {/* Viewport Controls */}
                <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    id="btn-viewport-desktop"
                    onClick={() => setPreviewViewport('desktop')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      previewViewport === 'desktop' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    🖥️ Desktop
                  </button>
                  <button
                    type="button"
                    id="btn-viewport-tablet"
                    onClick={() => setPreviewViewport('tablet')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      previewViewport === 'tablet' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📱 Tablet
                  </button>
                  <button
                    type="button"
                    id="btn-viewport-mobile"
                    onClick={() => setPreviewViewport('mobile')}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      previewViewport === 'mobile' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    📲 Mobile
                  </button>
                </div>
              </div>

              {/* Analysis Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Framework</span>
                  <span className="text-sm font-bold text-indigo-700 capitalize">
                    {analysisResult.framework} {analysisResult.frameworkVersion ? `(${analysisResult.frameworkVersion})` : ''}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Total Files</span>
                  <span className="text-sm font-bold text-slate-800">{analysisResult.totalFiles} files</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Sections Found</span>
                  <span className="text-sm font-bold text-slate-800">{analysisResult.detectedSections.length} sections</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-500 uppercase block">Assets Found</span>
                  <span className="text-sm font-bold text-slate-800">
                    {analysisResult.imageFiles.length} imgs • {analysisResult.cssFiles.length} css • {analysisResult.scriptFiles.length} js
                  </span>
                </div>
              </div>

              {/* Warnings / Unsupported Features Alert */}
              {analysisResult.warnings.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <span>⚠️</span>
                    <span>Imported with warnings</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-amber-800/90 pl-1">
                    {analysisResult.warnings.map((w, idx) => (
                      <li key={idx}>{w}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-700 pt-1">
                    Static visual layout and editable sections have been successfully extracted and normalized.
                  </p>
                </div>
              )}

              {/* Detected Sections Badges */}
              <div className="space-y-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Detected Sections ({analysisResult.detectedSections.length}):
                </span>
                <div className="flex flex-wrap gap-2">
                  {analysisResult.detectedSections.map((sec, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700 flex items-center gap-1.5"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                      <span>{sec.label}</span>
                      <span className="text-[10px] opacity-60">({Math.round(sec.confidence * 100)}%)</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Normalized Website Preview */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Normalized Website Preview:
                </span>
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-inner bg-slate-900 p-4 sm:p-6 flex justify-center">
                  <div className="w-full flex justify-center overflow-x-hidden">
                    <WebsiteRenderer
                      page={analysisResult.normalizedDocument.page}
                      viewport={previewViewport}
                      interactive={false}
                    />
                  </div>
                </div>
              </div>

              {/* Review Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <Button id="btn-cancel-import" variant="outline" onClick={() => setAnalysisResult(null)}>
                  Cancel / Re-upload
                </Button>
                <Button
                  id="btn-publish-website"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 shadow-md"
                  onClick={handlePublishWebsite}
                  disabled={isPublishingWebsite}
                >
                  {isPublishingWebsite ? 'Publishing Template...' : 'Publish Website Template →'}
                </Button>
              </div>
            </div>
          )}

          {/* Website Template ZIP Upload Form (Shown when no analysis is active) */}
          {!analysisResult && !publishedWebsite && (
            <form onSubmit={handleAnalyzeZip} className="space-y-8 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
              <div className="border-b border-slate-200 pb-4">
                <h3 className="text-lg font-bold text-slate-900">Import Existing Website ZIP</h3>
                <p className="text-xs text-slate-500 mt-1">
                  Upload an existing contributor website archive (.zip). The backend will safely analyze, extract, and normalize its content into an editable sBLOOM website master.
                </p>
              </div>

              {/* Template Name & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="website-template-name-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Template Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="website-template-name-input"
                    type="text"
                    required
                    placeholder="e.g. Horizon Academy School Website"
                    value={websiteTitle}
                    onChange={(e) => setWebsiteTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="website-category-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Vertical / Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="website-category-select"
                    value={websiteCategory}
                    onChange={(e) => setWebsiteCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  >
                    <option value="School">School</option>
                    <option value="Degree College">Degree College</option>
                    <option value="Healthcare">Healthcare / Hospital</option>
                    <option value="College">College</option>
                    <option value="Coaching">Coaching</option>
                    <option value="Other">Other (Custom)</option>
                  </select>
                </div>
              </div>

              {/* Contributor & Description */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="website-contributor-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Contributor / Source
                  </label>
                  <input
                    id="website-contributor-input"
                    type="text"
                    placeholder="e.g. Sravani, Akbar, Disha, Poorvisha, Sathvika"
                    value={websiteContributor}
                    onChange={(e) => setWebsiteContributor(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="website-description-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Description
                  </label>
                  <input
                    id="website-description-input"
                    type="text"
                    placeholder="Brief description of the website template"
                    value={websiteDescription}
                    onChange={(e) => setWebsiteDescription(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>
              </div>

              {/* ZIP Upload Dropzone */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Upload Website ZIP Archive <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-slate-500">
                  Accepts standard .zip archives (max 25MB compressed, 50MB uncompressed). Executable files and nested archives are strictly rejected.
                </p>

                <div
                  onDrop={handleZipDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsZipDragging(true);
                  }}
                  onDragLeave={() => setIsZipDragging(false)}
                  onClick={() => zipInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isZipDragging
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : zipFile
                      ? 'border-emerald-400 bg-emerald-50/20'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={zipInputRef}
                    type="file"
                    accept=".zip,application/zip,application/x-zip-compressed"
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        handleZipSelection(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />

                  {zipFile ? (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto text-2xl font-bold">
                        📦
                      </div>
                      <p className="text-sm font-bold text-slate-900">{zipFile.name}</p>
                      <p className="text-xs text-slate-500">
                        {Math.round(zipFile.size / 1024)} KB • Ready for safe inspection
                      </p>
                      <span className="inline-block text-xs text-indigo-600 font-semibold underline mt-1">
                        Click to choose a different ZIP
                      </span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center mx-auto text-2xl">
                        📁
                      </div>
                      <p className="text-sm font-semibold text-slate-800">
                        Drag and drop your website .zip file here, or browse
                      </p>
                      <p className="text-xs text-slate-500">Supports Static HTML/CSS/JS, Vite, React, Next.js</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button
                  id="btn-analyze-website-zip"
                  type="submit"
                  disabled={!zipFile || isAnalyzing}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 shadow-md"
                >
                  {isAnalyzing ? 'Inspecting & Normalizing ZIP...' : 'Analyze & Inspect ZIP →'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* 2. SOCIAL POST CREATION WORKFLOW (Existing Phase 2 & 3) */}
      {/* ============================================================== */}
      {assetType === 'social-post' && (
        <div>
          {/* Success Notification */}
          {successResult && (
            <div id="add-asset-success" className="bg-emerald-50 border border-emerald-300 rounded-2xl p-6 shadow-sm space-y-4 animate-in fade-in">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                  ✓
                </div>
                <div className="flex-grow">
                  <h3 className="text-lg font-bold text-emerald-950">Master Asset Added Successfully!</h3>
                  <p className="text-sm text-emerald-800 mt-1">
                    The asset has been registered, saved, and published to the organization library.
                  </p>

                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-white/80 p-4 rounded-xl border border-emerald-200">
                    <div>
                      <span className="font-semibold text-slate-600">Title:</span> {successResult.title}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Category:</span> {successResult.category}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Asset Type:</span> {successResult.assetType || 'social-post'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Classification:</span>{' '}
                      {successResult.isCustomizable ? (
                        <span className="font-semibold text-purple-700">Editable Template</span>
                      ) : (
                        <span className="font-semibold text-blue-700">Standard Asset</span>
                      )}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Dimensions:</span> {successResult.dimensions.width} × {successResult.dimensions.height} px
                    </div>
                    <div>
                      <span className="font-semibold text-slate-600">Storage Target:</span>{' '}
                      <span className="font-mono text-[11px] text-slate-500">{successResult.storageResult?.storageKey || 'canonical-key'}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-3 pt-2 justify-end border-t border-emerald-200">
                <Button id="btn-add-another" variant="outline" onClick={resetForm}>
                  Add Another Asset
                </Button>
                <Button
                  id="btn-view-library"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => router.push('/library')}
                >
                  View in Template Library →
                </Button>
              </div>
            </div>
          )}

          {/* Social Post Form */}
          {!successResult && (
            <form onSubmit={handleSubmit} className="space-y-8 bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
              {/* Classification Selection */}
              <div className="space-y-3">
                <label className="block text-sm font-semibold text-slate-900">
                  1. Asset Classification <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-slate-500">
                  Clarify whether this creative is a standard downloadable asset or an interactive editable template.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div
                    id="select-classification-standard"
                    onClick={() => setIsCustomizable(false)}
                    className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                      !isCustomizable
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-blue-100 text-blue-800">
                        Standard Asset
                      </span>
                      <input
                        type="radio"
                        name="classification"
                        checked={!isCustomizable}
                        onChange={() => setIsCustomizable(false)}
                        className="h-4 w-4 text-indigo-600"
                      />
                    </div>
                    <h4 className="font-semibold text-slate-900 text-sm">Download / Reuse Creative</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Finished visual graphic for direct download, social posting, or archival reuse. Not layer-editable.
                    </p>
                  </div>

                  <div
                    id="select-classification-template"
                    onClick={() => setIsCustomizable(true)}
                    className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
                      isCustomizable
                        ? 'border-indigo-600 bg-indigo-50/50 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-purple-100 text-purple-800">
                        Editable Template
                      </span>
                      <input
                        type="radio"
                        name="classification"
                        checked={isCustomizable}
                        onChange={() => setIsCustomizable(true)}
                        className="h-4 w-4 text-indigo-600"
                      />
                    </div>
                    <h4 className="font-semibold text-slate-900 text-sm">Customizable Master Template</h4>
                    <p className="text-xs text-slate-500 mt-1">
                      Contains structured document layers. Contributors can click Customize to open in browser canvas.
                    </p>
                  </div>
                </div>
              </div>

              <input type="hidden" id="asset-type-input" value={assetType} />

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="asset-title-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="asset-title-input"
                    type="text"
                    placeholder="e.g. Foundation Batch 2026 Admissions"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                <div>
                  <label htmlFor="category-select" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="category-select"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  >
                    <option value="Coaching">Coaching</option>
                    <option value="Colleges">Colleges</option>
                    <option value="Schools">Schools</option>
                    <option value="Other">Other (Custom)</option>
                  </select>
                </div>
              </div>

              {category === 'Other' && (
                <div>
                  <label htmlFor="custom-category-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Specify Custom Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="custom-category-input"
                    type="text"
                    required
                    placeholder="e.g. Healthcare, Universities, Workshops"
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                  />
                </div>
              )}

              {/* Description */}
              <div>
                <label htmlFor="description-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Description
                </label>
                <textarea
                  id="description-input"
                  rows={3}
                  placeholder="Optional description of this master creative..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-50 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900"
                />
              </div>

              {/* Primary Image Upload */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  2. Primary Asset File <span className="text-red-500">*</span>
                </label>

                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50'
                      : file
                      ? 'border-emerald-400 bg-emerald-50/20'
                      : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                  }`}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />

                  {filePreview ? (
                    <div className="space-y-3">
                      <div className="max-h-64 max-w-sm mx-auto overflow-hidden rounded-xl shadow-md border border-slate-200">
                        <img src={filePreview} alt="Preview" className="w-full h-auto object-contain" />
                      </div>
                      <p className="text-xs text-slate-600 font-medium">{file?.name} ({Math.round((file?.size || 0) / 1024)} KB)</p>
                      <span className="text-xs text-indigo-600 underline">Click to replace file</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-600 flex items-center justify-center mx-auto text-2xl">
                        📷
                      </div>
                      <p className="text-sm font-semibold text-slate-800">Drag & drop your primary image here, or browse</p>
                      <p className="text-xs text-slate-500">Supports JPG, PNG, WEBP</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label htmlFor="asset-width-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Width (px)
                  </label>
                  <input
                    id="asset-width-input"
                    type="number"
                    min={1}
                    value={width}
                    onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
                <div>
                  <label htmlFor="asset-height-input" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Height (px)
                  </label>
                  <input
                    id="asset-height-input"
                    type="number"
                    min={1}
                    value={height}
                    onChange={(e) => setHeight(parseInt(e.target.value) || 0)}
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-900"
                  />
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-4 border-t border-slate-200">
                <Button
                  id="btn-submit-asset"
                  type="submit"
                  disabled={isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 shadow-md"
                >
                  {isSubmitting ? 'Adding Master Asset...' : 'Add Master Asset →'}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
