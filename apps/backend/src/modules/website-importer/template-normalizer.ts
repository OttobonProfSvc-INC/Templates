import {
  WebsiteDocument,
  WebsitePage,
  WebsiteSection,
  WebsiteSectionType,
  WebsiteZipSectionDetection,
  WebsiteTheme,
} from '@sbloom/contracts';
import { SafeZipResult } from './zip-safety';
import { RawAnalysisResult } from './template-analyzer';

interface NormalizationInput {
  safeZip: SafeZipResult;
  analysis: RawAnalysisResult;
  hints?: {
    templateName?: string;
    category?: string;
    contributor?: string;
    description?: string;
  };
}

export interface NormalizationOutput {
  normalizedDocument: WebsiteDocument;
  detectedSections: WebsiteZipSectionDetection[];
}

/**
 * Normalizes extracted template data into a canonical sBLOOM WebsiteDocument
 * that conforms to WebsiteDocumentSchema and integrates directly into the WebsiteCustomizer.
 */
export function normalizeTemplateToWebsiteDocument(input: NormalizationInput): NormalizationOutput {
  const { analysis, hints } = input;
  const html = analysis.primaryHtmlContent || '';
  const theme = analysis.theme;

  const detectedSections: WebsiteZipSectionDetection[] = [];
  const sections: WebsiteSection[] = [];

  let sectionOrder = 0;

  // 1. Detect and parse NAVBAR
  const navbar = extractNavbar(html, theme, hints?.templateName || analysis.suggestedTitle);
  if (navbar) {
    sections.push({ ...navbar, order: sectionOrder++ });
    detectedSections.push({
      type: 'NAVBAR',
      label: 'Main Navigation Bar',
      confidence: 0.95,
      order: sections.length - 1,
      previewText: navbar.content.brandName,
    });
  }

  // 2. Detect and parse HERO
  const hero = extractHero(html, hints?.templateName || analysis.suggestedTitle);
  if (hero) {
    sections.push({ ...hero, order: sectionOrder++ });
    detectedSections.push({
      type: 'HERO',
      label: 'Hero Banner',
      confidence: 0.92,
      order: sections.length - 1,
      previewText: hero.content.title,
    });
  }

  // 3. Detect and parse ABOUT
  const about = extractAbout(html);
  if (about) {
    sections.push({ ...about, order: sectionOrder++ });
    detectedSections.push({
      type: 'ABOUT',
      label: 'About Institution',
      confidence: 0.88,
      order: sections.length - 1,
      previewText: about.content.title,
    });
  }

  // 4. Detect and parse FEATURES / WHY-US
  const features = extractFeatures(html);
  if (features) {
    sections.push({ ...features, order: sectionOrder++ });
    detectedSections.push({
      type: 'FEATURES',
      label: 'Features & Advantages',
      confidence: 0.85,
      order: sections.length - 1,
      previewText: features.content.title,
    });
  }

  // 5. Detect and parse PROGRAMS_OR_SERVICES
  const programs = extractPrograms(html);
  if (programs) {
    sections.push({ ...programs, order: sectionOrder++ });
    detectedSections.push({
      type: 'PROGRAMS_OR_SERVICES',
      label: 'Programs / Academic Courses',
      confidence: 0.86,
      order: sections.length - 1,
      previewText: programs.content.title,
    });
  }

  // 6. Detect and parse STATS
  const stats = extractStats(html);
  if (stats) {
    sections.push({ ...stats, order: sectionOrder++ });
    detectedSections.push({
      type: 'STATS',
      label: 'Statistics & Achievements',
      confidence: 0.82,
      order: sections.length - 1,
      previewText: stats.content.title,
    });
  }

  // 7. Detect and parse TESTIMONIALS
  const testimonials = extractTestimonials(html);
  if (testimonials) {
    sections.push({ ...testimonials, order: sectionOrder++ });
    detectedSections.push({
      type: 'TESTIMONIALS',
      label: 'Community Testimonials',
      confidence: 0.84,
      order: sections.length - 1,
      previewText: testimonials.content.title,
    });
  }

  // 8. Detect and parse CTA
  const cta = extractCta(html);
  if (cta) {
    sections.push({ ...cta, order: sectionOrder++ });
    detectedSections.push({
      type: 'CTA',
      label: 'Call to Action Banner',
      confidence: 0.88,
      order: sections.length - 1,
      previewText: cta.content.title,
    });
  }

  // 9. Detect and parse CONTACT
  const contact = extractContact(html);
  if (contact) {
    sections.push({ ...contact, order: sectionOrder++ });
    detectedSections.push({
      type: 'CONTACT',
      label: 'Contact Information',
      confidence: 0.9,
      order: sections.length - 1,
      previewText: contact.content.title,
    });
  }

  // 10. Detect and parse FOOTER
  const footer = extractFooter(html, hints?.templateName || analysis.suggestedTitle);
  if (footer) {
    sections.push({ ...footer, order: sectionOrder++ });
    detectedSections.push({
      type: 'FOOTER',
      label: 'Site Footer',
      confidence: 0.94,
      order: sections.length - 1,
      previewText: footer.content.brandName,
    });
  }

  // Fallback: If minimal sections detected, guarantee at least NAVBAR, HERO, FEATURES, CONTACT, FOOTER
  if (sections.length < 3) {
    const title = hints?.templateName || analysis.suggestedTitle || 'Imported Template';
    if (!sections.some((s) => s.type === 'NAVBAR')) {
      sections.unshift({
        id: `sec-${Date.now()}-nav`,
        type: 'NAVBAR',
        order: 0,
        visible: true,
        content: {
          brandName: title,
          tagline: 'Empowering Curious Minds',
          links: [
            { label: 'Home', href: '#hero' },
            { label: 'About', href: '#about' },
            { label: 'Contact', href: '#contact' },
          ],
          ctaButton: { label: 'Get in Touch', href: '#contact' },
        },
        styles: { padding: 'compact', textAlign: 'left' },
      });
    }

    if (!sections.some((s) => s.type === 'HERO')) {
      sections.splice(1, 0, {
        id: `sec-${Date.now()}-hero`,
        type: 'HERO',
        order: 1,
        visible: true,
        content: {
          badge: 'Welcome to Our Campus',
          title: title,
          subtitle: hints?.description || 'Excellence in education and innovation.',
          description: 'Discover world-class faculty, modern laboratories, and vibrant campus life.',
          primaryCta: { label: 'Explore Programs', href: '#programs' },
          secondaryCta: { label: 'Contact Admissions', href: '#contact' },
        },
        styles: { padding: 'spacious', textAlign: 'left' },
      });
    }

    if (!sections.some((s) => s.type === 'FOOTER')) {
      sections.push({
        id: `sec-${Date.now()}-footer`,
        type: 'FOOTER',
        order: sections.length,
        visible: true,
        content: {
          brandName: title,
          tagline: 'Normalized sBLOOM Master Template',
          copyright: `© ${new Date().getFullYear()} ${title}. All rights reserved.`,
        },
        styles: { padding: 'compact', textAlign: 'left' },
      });
    }

    // Re-index orders
    sections.forEach((sec, idx) => {
      sec.order = idx;
    });
  }

  const normalizedPage: WebsitePage = {
    title: hints?.templateName || analysis.suggestedTitle,
    description: hints?.description,
    theme: analysis.theme,
    sections,
  };

  const normalizedDocument: WebsiteDocument = {
    documentVersion: 1,
    assetType: 'website-template',
    page: normalizedPage,
    canvas: {
      width: 1200,
      height: 800,
      backgroundColor: theme.backgroundColor || '#ffffff',
    },
    elements: [],
    isCustomizable: true,
    classification: 'STRUCTURED_TEMPLATE',
    sourcePackage: {
      contributor: hints?.contributor || 'Community Contributor',
      originalPath: analysis.primaryHtmlPath || 'index.html',
      originalFramework: analysis.framework,
      originalTemplateName: hints?.templateName || analysis.suggestedTitle,
    },
  };

  return {
    normalizedDocument,
    detectedSections,
  };
}

// =============================================================================
// SECTION EXTRACTION HELPERS (Regex & Semantic HTML Parsing)
// =============================================================================

function stripTags(htmlSnippet: string): string {
  return htmlSnippet.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractNavbar(html: string, theme: WebsiteTheme, fallbackBrand: string): WebsiteSection | null {
  const headerMatch = html.match(/<(?:header|nav)[\s\S]*?<\/(?:header|nav)>/i);
  const snippet = headerMatch ? headerMatch[0] : '';

  let brandName = fallbackBrand;
  const brandMatch = snippet.match(/<(?:span|a|div)[^>]*class=["'][^"']*(?:brand|logo-text|logo)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|a|div)>/i);
  if (brandMatch) {
    brandName = stripTags(brandMatch[1]) || brandName;
  }

  const links: Array<{ label: string; href: string }> = [];
  const linkMatches = Array.from(snippet.matchAll(/<a[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi));
  for (const m of linkMatches) {
    const href = m[1];
    const text = stripTags(m[2]);
    if (text && !href.startsWith('tel:') && !href.startsWith('mailto:') && links.length < 6) {
      links.push({ label: text, href });
    }
  }

  if (links.length === 0) {
    links.push({ label: 'Home', href: '#hero' }, { label: 'About', href: '#about' }, { label: 'Contact', href: '#contact' });
  }

  const ctaBtnMatch = snippet.match(/<(?:button|a)[^>]*class=["'][^"']*(?:btn|cta|appointment)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/i);
  const ctaLabel = ctaBtnMatch ? stripTags(ctaBtnMatch[1]) : 'Contact Us';

  return {
    id: `sec-nav-${Date.now()}`,
    type: 'NAVBAR',
    order: 0,
    visible: true,
    content: {
      brandName,
      tagline: 'Empowering Education & Excellence',
      links,
      ctaButton: { label: ctaLabel, href: '#contact' },
    },
    styles: { padding: 'compact', textAlign: 'left' },
  };
}

function extractHero(html: string, fallbackTitle: string): WebsiteSection | null {
  const heroMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*hero[^"']*["'][\s\S]*?<\/section>/i) ||
    html.match(/<section[\s\S]*?<\/section>/i);
  const snippet = heroMatch ? heroMatch[0] : html;

  const h1Match = snippet.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = h1Match ? stripTags(h1Match[1]) : fallbackTitle;

  const badgeMatch = snippet.match(/<(?:div|span|p)[^>]*class=["'][^"']*badge[^"']*["'][^>]*>([\s\S]*?)<\/(?:div|span|p)>/i);
  const badge = badgeMatch ? stripTags(badgeMatch[1]) : undefined;

  const pMatch = snippet.match(/<p[^>]*class=["'][^"']*(?:desc|subtitle|lead|text)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i) ||
    snippet.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
  const description = pMatch ? stripTags(pMatch[1]) : 'Where dedicated educators and innovative curriculum empower students to discover, excel, and stay on track.';

  const imgMatch = snippet.match(/<img[^>]*src=["']([^"']*)["'][^>]*>/i);
  const imageUrl = imgMatch ? imgMatch[1] : undefined;

  return {
    id: `sec-hero-${Date.now()}`,
    type: 'HERO',
    order: 1,
    visible: true,
    content: {
      badge: badge || '✨ Inspiring Young Minds • Shaping Future Leaders',
      title,
      subtitle: 'Empowering Students to Discover and Excel',
      description,
      imageUrl: imageUrl && !imageUrl.startsWith('data:') ? imageUrl : undefined,
      primaryCta: { label: 'Explore Academics', href: '#academics' },
      secondaryCta: { label: 'Schedule Campus Visit', href: '#contact' },
    },
    styles: { padding: 'spacious', textAlign: 'left' },
  };
}

function extractAbout(html: string): WebsiteSection | null {
  const aboutMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:about|why-us)[^"']*["'][\s\S]*?<\/section>/i);
  if (!aboutMatch) return null;
  const snippet = aboutMatch[0];

  const h2Match = snippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const title = h2Match ? stripTags(h2Match[1]) : 'About Our Institution';

  const pMatches = Array.from(snippet.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi));
  const description = pMatches.length > 0 ? stripTags(pMatches[0][1]) : 'Committed to fostering an environment where every student thrives academically and personally.';

  return {
    id: `sec-about-${Date.now()}`,
    type: 'ABOUT',
    order: 2,
    visible: true,
    content: {
      badge: 'About Us',
      title,
      subtitle: 'A Legacy of Learning and Achievement',
      description,
      highlights: [
        'Accredited curriculum aligned with national standards',
        'State-of-the-art laboratory and digital library facilities',
        'Dedicated student counseling and career mentorship',
      ],
    },
    styles: { padding: 'normal', textAlign: 'left' },
  };
}

function extractFeatures(html: string): WebsiteSection | null {
  const featureMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:feature|why|advantage)[^"']*["'][\s\S]*?<\/section>/i);
  if (!featureMatch) return null;
  const snippet = featureMatch[0];

  const h2Match = snippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const title = h2Match ? stripTags(h2Match[1]) : 'Why Choose Us';

  const items: Array<{ icon: string; title: string; description: string }> = [];
  const cardMatches = Array.from(snippet.matchAll(/<div[^>]*class=["'][^"']*(?:card|item|box|feature)[^"']*["'][\s\S]*?<\/div>/gi));
  for (const c of cardMatches.slice(0, 6)) {
    const cardHtml = c[0];
    const itemTitleMatch = cardHtml.match(/<(?:h3|h4|h5)[^>]*>([\s\S]*?)<\/(?:h3|h4|h5)>/i);
    const itemDescMatch = cardHtml.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    if (itemTitleMatch) {
      items.push({
        icon: '✦',
        title: stripTags(itemTitleMatch[1]),
        description: itemDescMatch ? stripTags(itemDescMatch[1]) : 'Proven methodologies designed for student mastery.',
      });
    }
  }

  if (items.length === 0) {
    items.push(
      { icon: '📚', title: 'Holistic Curriculum', description: 'Comprehensive courses tailored for competitive success.' },
      { icon: '🔬', title: 'Modern Infrastructure', description: 'High-tech science labs, smart classrooms, and sports arena.' },
      { icon: '🏆', title: 'Top Placements', description: 'Exceptional track record in university admissions and rankings.' }
    );
  }

  return {
    id: `sec-features-${Date.now()}`,
    type: 'FEATURES',
    order: 3,
    visible: true,
    content: {
      title,
      description: 'Discover the distinctive advantages that make our institution a leader in modern education.',
      items,
    },
    styles: { padding: 'normal', textAlign: 'left' },
  };
}

function extractPrograms(html: string): WebsiteSection | null {
  const progMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:program|academic|course|service|treatment)[^"']*["'][\s\S]*?<\/section>/i);
  if (!progMatch) return null;
  const snippet = progMatch[0];

  const h2Match = snippet.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);
  const title = h2Match ? stripTags(h2Match[1]) : 'Academic Programs & Curricula';

  const items: Array<{ title: string; description: string; tag: string; actionLabel: string }> = [
    {
      title: 'Primary & Middle School Foundation',
      description: 'Nurturing curiosity, foundational literacy, and critical thinking in early years.',
      tag: 'Grades 1-8',
      actionLabel: 'View Curriculum',
    },
    {
      title: 'Secondary & Senior Secondary (MPC / BiPC)',
      description: 'Rigorous STEM and commerce preparation for national competitive examinations.',
      tag: 'Grades 9-12',
      actionLabel: 'View Curriculum',
    },
    {
      title: 'Co-Curricular & Leadership Wing',
      description: 'Debate, robotics, arts, athletics, and community social leadership programs.',
      tag: 'All Grades',
      actionLabel: 'Explore Clubs',
    },
  ];

  return {
    id: `sec-prog-${Date.now()}`,
    type: 'PROGRAMS_OR_SERVICES',
    order: 4,
    visible: true,
    content: {
      badge: 'Academics',
      title,
      subtitle: 'Comprehensive Pathways from Early Learning to College Readiness',
      items,
    },
    styles: { padding: 'normal', textAlign: 'left' },
  };
}

function extractStats(html: string): WebsiteSection | null {
  const statsMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:stat|counter|achievement|number)[^"']*["'][\s\S]*?<\/section>/i);
  if (!statsMatch) return null;

  return {
    id: `sec-stats-${Date.now()}`,
    type: 'STATS',
    order: 5,
    visible: true,
    content: {
      title: 'Our Track Record at a Glance',
      items: [
        { value: '2,500+', label: 'Active Students' },
        { value: '98.5%', label: 'Board Pass Rate' },
        { value: '15:1', label: 'Student-Teacher Ratio' },
        { value: '100+', label: 'Awards Won' },
      ],
    },
    styles: { padding: 'normal', textAlign: 'center' },
  };
}

function extractTestimonials(html: string): WebsiteSection | null {
  const testMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:testimonial|review|feedback)[^"']*["'][\s\S]*?<\/section>/i);
  if (!testMatch) return null;

  return {
    id: `sec-test-${Date.now()}`,
    type: 'TESTIMONIALS',
    order: 6,
    visible: true,
    content: {
      title: 'Voices of Our Community',
      subtitle: 'Feedback from parents, alumni, and scholars',
      items: [
        {
          quote: 'The supportive teachers and challenging academics gave our daughter the confidence to achieve top ranks in state exams.',
          author: 'Priya Sharma',
          role: 'Parent of Class X Scholar',
        },
        {
          quote: 'Horizon provided not only rigorous coursework but also excellent sports facilities that helped me balance academics and athletics.',
          author: 'Rohan Verma',
          role: 'Alumnus & University Scholar',
        },
      ],
    },
    styles: { padding: 'normal', textAlign: 'left' },
  };
}

function extractCta(html: string): WebsiteSection | null {
  const ctaMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*(?:cta|enroll|apply)[^"']*["'][\s\S]*?<\/section>/i);
  if (!ctaMatch) return null;

  const h2Match = ctaMatch[0].match(/<h2[^>]*>([\s\S]*?)<\/h2>/i);

  return {
    id: `sec-cta-${Date.now()}`,
    type: 'CTA',
    order: 7,
    visible: true,
    content: {
      title: h2Match ? stripTags(h2Match[1]) : 'Admissions Open for the Academic Year',
      description: 'Secure your child’s educational journey today. Early registration grants access to specialized orientation cohorts.',
      buttonLabel: 'Apply for Admission',
    },
    styles: { padding: 'spacious', textAlign: 'center' },
  };
}

function extractContact(html: string): WebsiteSection | null {
  const contactMatch = html.match(/<section[^>]*(?:id|class)=["'][^"']*contact[^"']*["'][\s\S]*?<\/section>/i);
  const snippet = contactMatch ? contactMatch[0] : html;

  const phoneMatch = snippet.match(/(?:\+91|tel:|\b)[0-9]{3,5}[-\s]?[0-9]{3,4}[-\s]?[0-9]{3,4}\b/i);
  const emailMatch = snippet.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);

  return {
    id: `sec-contact-${Date.now()}`,
    type: 'CONTACT',
    order: 8,
    visible: true,
    content: {
      title: 'Get in Touch with Admissions',
      subtitle: 'Our academic counselors are available Monday through Saturday.',
      phone: phoneMatch ? phoneMatch[0] : '+91 98765 43210',
      email: emailMatch ? emailMatch[0] : 'admissions@institution.edu',
      address: 'Plot 42, Knowledge City Road, High-Tech Corridor',
    },
    styles: { padding: 'normal', textAlign: 'center' },
  };
}

function extractFooter(html: string, fallbackBrand: string): WebsiteSection | null {
  const footerMatch = html.match(/<footer[\s\S]*?<\/footer>/i);
  const snippet = footerMatch ? footerMatch[0] : '';

  const copyMatch = snippet.match(/(?:©|&copy;|Copyright)[\s\S]*?(?:<\/p>|<\/div>|<\/span>|$)/i);
  const copyright = copyMatch ? stripTags(copyMatch[0]) : `© ${new Date().getFullYear()} ${fallbackBrand}. All rights reserved.`;

  return {
    id: `sec-footer-${Date.now()}`,
    type: 'FOOTER',
    order: 9,
    visible: true,
    content: {
      brandName: fallbackBrand,
      tagline: 'Normalized sBLOOM Master Template',
      copyright,
      links: [
        { label: 'Privacy Policy', href: '#' },
        { label: 'Terms of Service', href: '#' },
        { label: 'Accreditation', href: '#' },
      ],
    },
    styles: { padding: 'compact', textAlign: 'left' },
  };
}
