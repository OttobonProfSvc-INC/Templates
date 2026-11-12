'use client';

import React from 'react';
import { WebsitePage, WebsiteSection, WebsiteTheme } from '@sbloom/contracts';

interface WebsiteRendererProps {
  page: WebsitePage;
  viewport?: 'desktop' | 'tablet' | 'mobile';
  selectedSectionId?: string | null;
  onSelectSection?: (id: string) => void;
  interactive?: boolean;
}

export function WebsiteRenderer({
  page,
  viewport = 'desktop',
  selectedSectionId,
  onSelectSection,
  interactive = false,
}: WebsiteRendererProps) {
  const theme: WebsiteTheme = {
    primaryColor: page.theme?.primaryColor || '#2563eb',
    secondaryColor: page.theme?.secondaryColor || '#1e293b',
    backgroundColor: page.theme?.backgroundColor || '#ffffff',
    textColor: page.theme?.textColor || '#0f172a',
    accentColor: page.theme?.accentColor || '#38bdf8',
    headingFont: page.theme?.headingFont || 'Inter, sans-serif',
    bodyFont: page.theme?.bodyFont || 'Inter, sans-serif',
  };

  const sortedSections = [...(page.sections || [])]
    .filter((s) => s.visible !== false)
    .sort((a, b) => a.order - b.order);

  // Responsive container width
  const containerWidthClass =
    viewport === 'mobile'
      ? 'w-[375px] max-w-full'
      : viewport === 'tablet'
      ? 'w-[768px] max-w-full'
      : 'w-full max-w-[1200px]';

  return (
    <div
      className={`mx-auto transition-all duration-300 shadow-sm bg-white overflow-x-hidden ${containerWidthClass}`}
      style={{
        fontFamily: theme.bodyFont,
        color: theme.textColor,
        backgroundColor: theme.backgroundColor,
      }}
    >
      {sortedSections.map((section) => {
        const isSelected = selectedSectionId === section.id;
        return (
          <div
            key={section.id}
            id={`section-${section.id}`}
            onClick={(e) => {
              if (interactive && onSelectSection) {
                e.stopPropagation();
                onSelectSection(section.id);
              }
            }}
            className={`relative transition-all duration-200 ${
              interactive ? 'cursor-pointer hover:ring-2 hover:ring-indigo-300' : ''
            } ${
              isSelected
                ? 'ring-2 ring-indigo-600 ring-offset-2 z-10'
                : ''
            }`}
          >
            {interactive && isSelected && (
              <div className="absolute top-2 right-2 z-30 flex items-center gap-1.5 px-2.5 py-1 bg-indigo-600 text-white text-[11px] font-semibold rounded-md shadow-md pointer-events-none">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Active: {section.type}</span>
              </div>
            )}
            {renderSectionContent(section, theme, viewport)}
          </div>
        );
      })}
    </div>
  );
}

function renderSectionContent(section: WebsiteSection, theme: WebsiteTheme, viewport: string) {
  const content = section.content || {};
  const styles = section.styles || {};
  const isMobile = viewport === 'mobile';
  const isTablet = viewport === 'tablet';

  const sectionBg = styles.backgroundColor || 'transparent';
  const sectionText = styles.textColor || 'inherit';
  const sectionPadding =
    styles.padding === 'compact'
      ? 'py-6 px-4 sm:px-6'
      : styles.padding === 'spacious'
      ? 'py-16 sm:py-24 px-4 sm:px-8'
      : 'py-10 sm:py-16 px-4 sm:px-8';

  switch (section.type) {
    case 'NAVBAR':
      return (
        <nav
          className="border-b sticky top-0 z-20 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between"
          style={{
            backgroundColor: sectionBg !== 'transparent' ? sectionBg : `${theme.backgroundColor}f0`,
            borderColor: '#e2e8f0',
            color: sectionText,
          }}
        >
          <div className="flex items-center gap-3">
            {content.logoUrl ? (
              <img
                src={content.logoUrl}
                alt={content.brandName || 'Brand'}
                className="h-9 w-auto object-contain rounded"
              />
            ) : (
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white shadow-sm"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {(content.brandName || 'S').charAt(0)}
              </div>
            )}
            <div>
              <span
                className="font-bold text-base sm:text-lg tracking-tight block"
                style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
              >
                {content.brandName || 'Brand'}
              </span>
              {content.tagline && (
                <span className="text-[10px] text-slate-500 font-medium tracking-wide uppercase block -mt-0.5">
                  {content.tagline}
                </span>
              )}
            </div>
          </div>

          {!isMobile && Array.isArray(content.links) && content.links.length > 0 && (
            <div className="flex items-center gap-6 text-sm font-medium">
              {content.links.map((link: any, idx: number) => (
                <a
                  key={idx}
                  href={link.href || '#'}
                  className="hover:opacity-80 transition-opacity"
                  style={{ color: theme.secondaryColor }}
                  onClick={(e) => e.preventDefault()}
                >
                  {link.label || link.title || 'Link'}
                </a>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            {content.phone && !isMobile && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-100 text-slate-700">
                📞 {content.phone}
              </span>
            )}
            {content.ctaButton && (
              <button
                className="px-3.5 py-1.5 text-xs sm:text-sm font-semibold rounded-lg text-white shadow-sm transition-transform active:scale-95"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {content.ctaButton.label || content.ctaButton.text || 'Contact'}
              </button>
            )}
            {isMobile && (
              <button className="p-1.5 text-slate-600 rounded-md hover:bg-slate-100">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            )}
          </div>
        </nav>
      );

    case 'HERO':
      return (
        <section
          className={`${sectionPadding} flex flex-col md:flex-row items-center justify-between gap-8 sm:gap-12 overflow-hidden`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="flex-1 space-y-4 max-w-2xl text-left">
            {content.badge && (
              <span
                className="inline-block px-3 py-1 text-xs font-semibold rounded-full shadow-sm"
                style={{
                  backgroundColor: `${theme.primaryColor}15`,
                  color: theme.primaryColor,
                  border: `1px solid ${theme.primaryColor}30`,
                }}
              >
                {content.badge}
              </span>
            )}
            <h1
              className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight leading-tight"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || content.headline || 'Welcome to our platform'}
            </h1>
            {content.subtitle && (
              <h2 className="text-base sm:text-xl font-medium text-slate-600 leading-snug">
                {content.subtitle}
              </h2>
            )}
            {content.description && (
              <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-xl">
                {content.description}
              </p>
            )}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {content.primaryCta && (
                <button
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: theme.primaryColor }}
                >
                  {content.primaryCta.label || content.primaryCta.text || 'Get Started'}
                </button>
              )}
              {content.secondaryCta && (
                <button
                  className="px-5 py-2.5 rounded-lg text-sm font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                >
                  {content.secondaryCta.label || content.secondaryCta.text || 'Learn More'}
                </button>
              )}
            </div>
            {content.stats && Array.isArray(content.stats) && (
              <div className="pt-4 flex items-center gap-6 border-t border-slate-200">
                {content.stats.map((st: any, idx: number) => (
                  <div key={idx}>
                    <span className="font-extrabold text-lg sm:text-xl" style={{ color: theme.primaryColor }}>
                      {st.value}
                    </span>
                    <span className="text-[11px] block text-slate-500 font-medium">{st.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {content.imageUrl && (
            <div className="flex-1 w-full max-w-lg flex items-center justify-center">
              <div className="relative rounded-2xl overflow-hidden shadow-xl border border-slate-200/80 w-full aspect-[4/3] bg-slate-100">
                <img
                  src={content.imageUrl}
                  alt={content.title || 'Hero image'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
            </div>
          )}
        </section>
      );

    case 'ABOUT':
      return (
        <section
          className={`${sectionPadding} space-y-6`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
            {content.imageUrl && (
              <div className="order-2 md:order-1 rounded-2xl overflow-hidden shadow-lg border border-slate-200 aspect-[4/3] bg-slate-100">
                <img
                  src={content.imageUrl}
                  alt={content.title || 'About us'}
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <div className={`space-y-4 ${content.imageUrl ? 'order-1 md:order-2' : 'col-span-full'}`}>
              {content.badge && (
                <span
                  className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-slate-100"
                  style={{ color: theme.primaryColor }}
                >
                  {content.badge}
                </span>
              )}
              <h2
                className="text-2xl sm:text-3xl font-bold tracking-tight"
                style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
              >
                {content.title || 'About Our Institution'}
              </h2>
              {content.subtitle && (
                <p className="text-sm sm:text-base font-semibold text-slate-700">
                  {content.subtitle}
                </p>
              )}
              {content.description && (
                <p className="text-sm text-slate-600 leading-relaxed">
                  {content.description}
                </p>
              )}
              {Array.isArray(content.highlights) && content.highlights.length > 0 && (
                <ul className="space-y-2 pt-2">
                  {content.highlights.map((h: string, idx: number) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="text-emerald-500 font-bold">✓</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      );

    case 'FEATURES':
      return (
        <section
          className={`${sectionPadding} space-y-8`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="text-center max-w-3xl mx-auto space-y-2">
            {content.badge && (
              <span
                className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-slate-100"
                style={{ color: theme.primaryColor }}
              >
                {content.badge}
              </span>
            )}
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || 'Key Features & Specialities'}
            </h2>
            {content.description && (
              <p className="text-sm text-slate-600">{content.description}</p>
            )}
          </div>

          {Array.isArray(content.items) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.items.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:shadow-md transition-shadow space-y-2 text-left"
                >
                  <div
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shadow-sm"
                    style={{ backgroundColor: `${theme.primaryColor}15`, color: theme.primaryColor }}
                  >
                    {item.icon || '✦'}
                  </div>
                  <h3 className="font-semibold text-base text-slate-900">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      );

    case 'PROGRAMS_OR_SERVICES':
      return (
        <section
          className={`${sectionPadding} space-y-8`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="text-center max-w-3xl mx-auto space-y-2">
            {content.badge && (
              <span
                className="text-xs font-bold tracking-wider uppercase px-2.5 py-1 rounded bg-slate-100"
                style={{ color: theme.primaryColor }}
              >
                {content.badge}
              </span>
            )}
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || 'Our Programs & Services'}
            </h2>
            {content.subtitle && (
              <p className="text-sm sm:text-base text-slate-600">{content.subtitle}</p>
            )}
          </div>

          {Array.isArray(content.items) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.items.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:border-indigo-300 hover:shadow-md transition-all flex flex-col justify-between"
                >
                  {item.imageUrl && (
                    <div className="aspect-[16/9] w-full bg-slate-100 overflow-hidden">
                      <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="p-5 flex-1 space-y-2">
                    {item.tag && (
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {item.tag}
                      </span>
                    )}
                    <h3 className="font-bold text-base text-slate-900">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{item.description}</p>
                    {item.details && (
                      <div className="text-xs text-slate-500 pt-2 border-t border-slate-100">
                        {item.details}
                      </div>
                    )}
                  </div>
                  {item.actionLabel && (
                    <div className="p-4 pt-0">
                      <button
                        className="w-full py-2 text-xs font-semibold rounded-lg text-white shadow-sm"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        {item.actionLabel}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      );

    case 'STATS':
      return (
        <section
          className={`${sectionPadding}`}
          style={{
            backgroundColor: sectionBg !== 'transparent' ? sectionBg : `${theme.secondaryColor}`,
            color: sectionText !== 'inherit' ? sectionText : '#ffffff',
          }}
        >
          <div className="max-w-5xl mx-auto">
            {content.title && (
              <h2 className="text-center text-xl sm:text-2xl font-bold mb-8">{content.title}</h2>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center">
              {Array.isArray(content.items) &&
                content.items.map((stat: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <span
                      className="text-2xl sm:text-4xl font-extrabold block"
                      style={{ color: theme.accentColor || '#38bdf8' }}
                    >
                      {stat.value}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold opacity-90 block">
                      {stat.label}
                    </span>
                    {stat.description && (
                      <span className="text-[11px] opacity-75 block">{stat.description}</span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        </section>
      );

    case 'TESTIMONIALS':
      return (
        <section
          className={`${sectionPadding} space-y-8`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || 'What Our Community Says'}
            </h2>
            {content.subtitle && <p className="text-sm text-slate-600">{content.subtitle}</p>}
          </div>

          {Array.isArray(content.items) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {content.items.map((item: any, idx: number) => (
                <div
                  key={idx}
                  className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm space-y-4 flex flex-col justify-between"
                >
                  <p className="text-xs sm:text-sm text-slate-700 italic leading-relaxed">
                    "{item.quote || item.text}"
                  </p>
                  <div className="flex items-center gap-3 pt-2 border-t border-slate-100">
                    {item.avatarUrl ? (
                      <img
                        src={item.avatarUrl}
                        alt={item.author}
                        className="w-9 h-9 rounded-full object-cover"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-white text-xs"
                        style={{ backgroundColor: theme.primaryColor }}
                      >
                        {(item.author || 'U').charAt(0)}
                      </div>
                    )}
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{item.author}</h4>
                      <p className="text-[11px] text-slate-500">{item.role || item.affiliation}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      );

    case 'CTA':
      return (
        <section
          className={`${sectionPadding} text-center`}
          style={{
            backgroundColor: sectionBg !== 'transparent' ? sectionBg : `${theme.primaryColor}10`,
            color: sectionText,
          }}
        >
          <div className="max-w-2xl mx-auto space-y-4">
            <h2
              className="text-2xl sm:text-3xl font-extrabold"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || 'Ready to Get Started?'}
            </h2>
            {content.description && (
              <p className="text-sm sm:text-base text-slate-600">{content.description}</p>
            )}
            <div className="pt-2 flex justify-center gap-3">
              <button
                className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white shadow-md hover:opacity-90"
                style={{ backgroundColor: theme.primaryColor }}
              >
                {content.buttonLabel || content.ctaText || 'Enroll Now'}
              </button>
            </div>
          </div>
        </section>
      );

    case 'CONTACT':
      return (
        <section
          className={`${sectionPadding} space-y-8`}
          style={{ backgroundColor: sectionBg, color: sectionText }}
        >
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2
              className="text-2xl sm:text-3xl font-bold tracking-tight"
              style={{ fontFamily: theme.headingFont, color: theme.secondaryColor }}
            >
              {content.title || 'Contact Us'}
            </h2>
            {content.subtitle && <p className="text-sm text-slate-600">{content.subtitle}</p>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {content.phone && (
              <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-1">
                <span className="text-2xl">📞</span>
                <h4 className="font-semibold text-sm text-slate-900">Phone</h4>
                <p className="text-xs text-slate-600">{content.phone}</p>
              </div>
            )}
            {content.email && (
              <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-1">
                <span className="text-2xl">✉️</span>
                <h4 className="font-semibold text-sm text-slate-900">Email</h4>
                <p className="text-xs text-slate-600">{content.email}</p>
              </div>
            )}
            {content.address && (
              <div className="p-4 rounded-xl border border-slate-200 bg-white text-center space-y-1">
                <span className="text-2xl">📍</span>
                <h4 className="font-semibold text-sm text-slate-900">Location</h4>
                <p className="text-xs text-slate-600">{content.address}</p>
              </div>
            )}
          </div>
        </section>
      );

    case 'FOOTER':
      return (
        <footer
          className="border-t px-4 sm:px-8 py-8 text-xs text-slate-500 space-y-4"
          style={{
            backgroundColor: sectionBg !== 'transparent' ? sectionBg : '#0f172a',
            color: sectionText !== 'inherit' ? sectionText : '#94a3b8',
            borderColor: '#334155',
          }}
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <span className="font-bold text-sm text-white block">
                {content.brandName || 'sBLOOM Template'}
              </span>
              <p className="text-[11px] mt-0.5">{content.tagline || 'Normalized sBLOOM Master Template'}</p>
            </div>
            {Array.isArray(content.links) && (
              <div className="flex flex-wrap gap-4 text-xs">
                {content.links.map((link: any, idx: number) => (
                  <a
                    key={idx}
                    href={link.href || '#'}
                    className="hover:text-white transition-colors"
                    onClick={(e) => e.preventDefault()}
                  >
                    {link.label || link.title}
                  </a>
                ))}
              </div>
            )}
          </div>
          <div className="pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px]">
            <span>{content.copyright || `© ${new Date().getFullYear()} All rights reserved.`}</span>
            {content.disclaimer && <span>{content.disclaimer}</span>}
          </div>
        </footer>
      );

    default:
      return (
        <section className={sectionPadding} style={{ backgroundColor: sectionBg }}>
          <h3 className="font-bold">{content.title || section.type}</h3>
          <p className="text-sm">{content.description || ''}</p>
        </section>
      );
  }
}
