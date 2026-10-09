/**
 * Ottobon Templates Hub — Enterprise Dashboard Application
 * Architecture: Vanilla JS, Zero Build Step, Local + Cloud Deployment Ready
 */

// =============================================================================
// 1. CONFIGURATION & STATE MANAGEMENT
// =============================================================================

const DEFAULT_CONFIG = {
  repoUrl: 'https://github.com/Ottobon-INC/Templates',
  branch: 'main',
  localPort: 3000
};

// Load saved config or use defaults
function loadConfig() {
  try {
    const saved = localStorage.getItem('ottobon_templates_config');
    if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
  } catch (e) {
    console.warn('Error reading config from localStorage:', e);
  }
  return { ...DEFAULT_CONFIG };
}

let AppConfig = loadConfig();

// App State
const AppState = {
  activeCategory: 'all',
  activeStacks: new Set(),
  activeAuthors: new Set(),
  searchQuery: '',
  sortBy: 'featured',
  viewMode: 'grid',
  savedTemplates: new Set(JSON.parse(localStorage.getItem('ottobon_saved_templates') || '[]')),
  currentModalTemplate: null,
  currentDevice: 'desktop'
};

// =============================================================================
// 2. MASTER TEMPLATES REGISTRY (28 Curated Templates)
// =============================================================================

const TEMPLATES = [
  // --- Akbar: Healthcare Templates ---
  {
    id: 'akbar-htd-1',
    name: 'Celestial Smiles Dental Clinic',
    category: 'Healthcare',
    author: 'Akbar',
    folderPath: 'akbar/Healthcare-Templates/HTD-1',
    type: 'nextjs',
    entryHtml: null,
    stacks: ['Next.js', 'React', 'Tailwind'],
    version: 'Next.js 16 • React 19',
    icon: 'fa-tooth',
    themeColor: '#0EA5E9',
    accentGradient: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
    description: 'A modern, high-performance web application for dental clinics featuring appointment scheduling, smile transformations gallery, and patient reviews.',
    features: [
      'Interactive Appointment Booking with Image Upload Preview',
      'Before & After Treatment Comparison Slider',
      'Meet the Doctors & Clinic Virtual Tour',
      'SEO Optimized JSON-LD Schema & Metadata'
    ],
    port: 3001,
    featured: true
  },
  {
    id: 'akbar-hte-2',
    name: 'Elite Healthcare & Diagnostics',
    category: 'Healthcare',
    author: 'Akbar',
    folderPath: 'akbar/Healthcare-Templates/HTE-2',
    type: 'nextjs',
    entryHtml: null,
    stacks: ['Next.js', 'React', 'Tailwind'],
    version: 'Next.js 16 • Tailwind CSS',
    icon: 'fa-heart-pulse',
    themeColor: '#2563EB',
    accentGradient: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
    description: 'Comprehensive medical center and diagnostics portal with automated online appointment booking, doctor directory, and health packages.',
    features: [
      'Full Outpatient & Diagnostic Center Scheduling',
      'Specialist Doctor Directory with Filterable Profiles',
      'Health Checkup Packages with Price Calculator',
      'Responsive Mobile-First Architecture'
    ],
    port: 3003,
    featured: true
  },

  // --- Disha: Degree & University Templates ---
  {
    id: 'disha-deg-1',
    name: 'EduVibe Modern Degree College',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Template-1',
    type: 'vite',
    entryHtml: 'disha/Degree-Template-1/preview.html',
    stacks: ['Vite', 'React', 'Tailwind'],
    version: 'Vite • React 19',
    icon: 'fa-graduation-cap',
    themeColor: '#6366F1',
    accentGradient: 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
    description: 'Modern undergraduate and graduate degree college portal featuring course catalogs, admissions workflow, and virtual campus tours.',
    features: [
      'Interactive Degree Course Explorer & Syllabus',
      'Online Admissions & Application Tracker',
      'Faculty Directory & Research Publications',
      'Campus News, Events & Academic Calendar'
    ],
    port: 5173,
    featured: true
  },
  {
    id: 'disha-deg-2',
    name: 'Campus Pulse University Experience',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Template-2',
    type: 'vite',
    entryHtml: 'disha/Degree-Template-2/index.html',
    stacks: ['Vite', 'React'],
    version: 'Vite • HTML5 Video',
    icon: 'fa-university',
    themeColor: '#3B82F6',
    accentGradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
    description: 'Media-rich university portal featuring 4K campus video showcases, athletic programs, and student life virtual tour.',
    features: [
      'Full HD & 4K Campus Showcase Videos',
      'Student Life & Athletic Department Highlights',
      'Interactive Campus Map & Building Guide',
      'Alumni Success Stories & Placements'
    ],
    port: 5174
  },
  {
    id: 'disha-deg-3',
    name: 'Global Institute of Technology',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Template-3',
    type: 'vite',
    entryHtml: 'disha/Degree-Template-3/dist/index.html',
    stacks: ['Vite', 'React', 'Tailwind', 'TypeScript'],
    version: 'Vite • TypeScript',
    icon: 'fa-microchip',
    themeColor: '#059669',
    accentGradient: 'linear-gradient(135deg, #059669 0%, #047857 100%)',
    description: 'Engineering and technical institute portal with laboratory showcases, accredited degree programs, and placement statistics.',
    features: [
      'Engineering & Computer Science Course Pages',
      'Research Labs & Innovation Center Portfolios',
      'Corporate Placement Track Record with Visual Metrics',
      'Online Student Grievance & Helpdesk'
    ]
  },
  {
    id: 'disha-deg-4',
    name: 'Horizon University & Graduate Studies',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Template-4',
    type: 'vite',
    entryHtml: 'disha/Degree-Template-4/preview.html',
    stacks: ['Vite', 'React', 'Tailwind', 'TypeScript'],
    version: 'Vite • TypeScript',
    icon: 'fa-building-columns',
    themeColor: '#7C3AED',
    accentGradient: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
    description: 'Prestigious university portal focused on postgraduate programs, master degrees, doctoral fellowships, and campus admissions.',
    features: [
      'Postgraduate Degree Specialization Selector',
      'Scholarship & Financial Aid Calculator',
      'Interactive Faculty Research Publications',
      'Virtual Open Day & Webinar Signups'
    ],
    port: 5175
  },
  {
    id: 'disha-deg-5',
    name: 'Apex College of Science & Arts',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Template-5',
    type: 'vite',
    entryHtml: 'disha/Degree-Template-5/preview.html',
    stacks: ['Vite', 'React', 'TypeScript'],
    version: 'Vite • TypeScript',
    icon: 'fa-flask',
    themeColor: '#D97706',
    accentGradient: 'linear-gradient(135deg, #D97706 0%, #B45309 100%)',
    description: 'Liberal arts and natural sciences college web portal highlighting interdisciplinary programs and student research initiatives.',
    features: [
      'Humanities & Natural Sciences Course Modules',
      'Digital Library & E-Learning Portal Gateway',
      'Annual Fest & Cultural Showcase',
      'Student Union & Club Activity Hub'
    ],
    port: 5176
  },
  {
    id: 'disha-deg-6',
    name: 'Pinnacle Academy & Degree College',
    category: 'Degree & College',
    author: 'Disha',
    folderPath: 'disha/Degree-Templet-6',
    type: 'vite',
    entryHtml: 'disha/Degree-Templet-6/preview.html',
    stacks: ['Vite', 'React', 'Tailwind', 'TypeScript'],
    version: 'Vite • TypeScript',
    icon: 'fa-award',
    themeColor: '#4338CA',
    accentGradient: 'linear-gradient(135deg, #4338CA 0%, #3730A3 100%)',
    description: 'Career-focused undergraduate college template with integrated skill bootcamps, internship portal, and employer recruitment hub.',
    features: [
      'Career Development & Internship Board',
      'Industry Partner Collaborations Display',
      'Student Portfolio Showcase',
      'Automated Admission Inquiry Form'
    ],
    port: 5177
  },

  // --- Poorvisha: Hospital & Clinical Templates ---
  {
    id: 'poorvisha-ht-1',
    name: 'St. Jude Memorial Hospital',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-1',
    type: 'static',
    entryHtml: 'poorvisha/Hospital-Templates/HT-1/index.html',
    stacks: ['HTML5', 'CSS3', 'JavaScript'],
    version: 'Pure HTML5 • Multi-page',
    icon: 'fa-hospital-user',
    themeColor: '#0284C7',
    accentGradient: 'linear-gradient(135deg, #0284C7 0%, #075985 100%)',
    description: 'Full-featured multi-page hospital portal with dedicated pages for appointments, departments, doctor search, and medical research.',
    features: [
      'Includes 10+ Complete HTML Pages (Departments, Doctors, Research)',
      'Doctor Appointment Booking Form with Validation',
      'Emergency Hotline & Location Finder',
      'Zero Build Step — Instant in-browser preview'
    ],
    featured: true
  },
  {
    id: 'poorvisha-ht-2',
    name: 'Metro Care Specialty Clinic',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-2',
    type: 'vite',
    entryHtml: 'poorvisha/Hospital-Templates/HT-2/preview.html',
    stacks: ['Vite', 'React', 'Tailwind'],
    version: 'Vite • Tailwind CSS',
    icon: 'fa-stethoscope',
    themeColor: '#10B981',
    accentGradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
    description: 'Modern outpatient surgical clinic template with specialty medical departments, insurance partners, and tele-health consultation booking.',
    features: [
      'Specialist Department Directory (Cardiology, Ortho, Neuro)',
      'Insurance Provider Verification Guide',
      'Direct Patient Consultation Form',
      'Lightweight Fast Bundle'
    ],
    port: 5178
  },
  {
    id: 'poorvisha-ht-3',
    name: 'CarePoint Multispeciality Hospital',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-3',
    type: 'vite',
    entryHtml: 'poorvisha/Hospital-Templates/HT-3/preview.html',
    stacks: ['Vite', 'React', 'Tailwind'],
    version: 'Vite • Modern UI',
    icon: 'fa-truck-medical',
    themeColor: '#EF4444',
    accentGradient: 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
    description: 'Trauma and 24/7 emergency hospital website template featuring emergency dispatch, blood bank status, and intensive care services.',
    features: [
      '24/7 Emergency Dispatch & Ambulance Tracking Bar',
      'Blood Bank Availability Dashboard',
      'Specialist On-Call Roster',
      'Patient Room & Amenities Tour'
    ]
  },
  {
    id: 'poorvisha-ht-4',
    name: 'Aurevia Health & 3D Cardiology',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-4/Aurevia Health',
    type: 'static',
    entryHtml: 'poorvisha/Hospital-Templates/HT-4/Aurevia Health/index.html',
    stacks: ['HTML5', 'CSS3', 'Video'],
    version: 'HTML5 • 3D Animations',
    icon: 'fa-dna',
    themeColor: '#8B5CF6',
    accentGradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
    description: 'High-tech medical portal featuring anatomical 3D heart simulations, neurology neuron animations, and orthopedic procedures.',
    features: [
      'Embedded 3D Anatomical Heart & Neuron Video Animations',
      'Dedicated Cardiology, Neurology & Orthopedic Sub-pages',
      'Patient Case Studies & Treatment Timelines',
      'Instant Live Preview in Browser'
    ],
    featured: true
  },
  {
    id: 'poorvisha-ht-5',
    name: 'Hope Oncology & Cancer Institute',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-5',
    type: 'vite',
    entryHtml: 'poorvisha/Hospital-Templates/HT-5/preview.html',
    stacks: ['Vite', 'React', 'Tailwind'],
    version: 'Vite • Modern UI',
    icon: 'fa-ribbon',
    themeColor: '#EC4899',
    accentGradient: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
    description: 'Specialized oncology and cancer therapy institute template with clinical trial signups, therapy schedules, and patient community support.',
    features: [
      'Clinical Trial Screening & Volunteer Form',
      'Chemotherapy & Radiation Guidance FAQ',
      'Survivor Stories & Patient Support Network',
      'Nutritional & Wellness Counseling Portal'
    ],
    port: 5179
  },
  {
    id: 'poorvisha-ht-6',
    name: 'MediPulse 3D Interactive Medical Care',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-6',
    type: 'vite',
    entryHtml: 'poorvisha/Hospital-Templates/HT-6/preview.html',
    stacks: ['Vite', 'React', 'Video'],
    version: 'Vite • 3D Visuals',
    icon: 'fa-cube',
    themeColor: '#14B8A6',
    accentGradient: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)',
    description: 'Next-generation interactive healthcare portal with embedded 3D medical device demonstrations and minimally invasive surgery guides.',
    features: [
      'High-Definition 3D Healthcare Simulation Animations',
      'Minimally Invasive Surgery Interactive Guides',
      'Robotic Surgical Suite Presentation',
      'Physician Referral Exchange'
    ],
    port: 5180
  },
  {
    id: 'poorvisha-ht-7',
    name: 'Zenith Children\'s Hospital & Pediatrics',
    category: 'Healthcare',
    author: 'Poorvisha',
    folderPath: 'poorvisha/Hospital-Templates/HT-7',
    type: 'vite',
    entryHtml: 'poorvisha/Hospital-Templates/HT-7/preview.html',
    stacks: ['Vite', 'React', 'TypeScript'],
    version: 'Vite • TypeScript',
    icon: 'fa-baby',
    themeColor: '#F59E0B',
    accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    description: 'Child-friendly pediatric hospital portal with colorful illustrations, vaccination trackers, and pediatric specialist appointment booking.',
    features: [
      'Childhood Immunization & Vaccine Scheduler',
      'Neonatal & Pediatric Intensive Care Guide',
      'Kid-Friendly Clinic Environment Gallery',
      'Parenting Tips & Emergency Pediatric FAQs'
    ],
    port: 5181
  },

  // --- Sathvika: Schools & College Templates ---
  {
    id: 'sathvika-school-1',
    name: 'Greenfield International School',
    category: 'School',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/Schools/school-template',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/Schools/school-template/index.html',
    stacks: ['HTML5', 'CSS3', 'JavaScript'],
    version: 'HTML5 • Live Preview',
    icon: 'fa-school',
    themeColor: '#16A34A',
    accentGradient: 'linear-gradient(135deg, #16A34A 0%, #15803D 100%)',
    description: 'Complete international K-12 school portal featuring curriculum overviews (IB/CBSE/Cambridge), admission steps, and campus facilities.',
    features: [
      'K-12 International Curriculum Breakdown',
      'Annual Admission Process & Fee Structure',
      'Science Labs, Sports Complex & Library Tour',
      'Instant Live Preview in Browser'
    ],
    featured: true
  },
  {
    id: 'sathvika-school-2',
    name: 'Oakridge Global Academy',
    category: 'School',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/School page',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/School page/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Pure CSS',
    icon: 'fa-apple-whole',
    themeColor: '#EA580C',
    accentGradient: 'linear-gradient(135deg, #EA580C 0%, #C2410C 100%)',
    description: 'Modern private academy website with interactive academic calendar, faculty directory, and extracurricular activity spotlight.',
    features: [
      'Dynamic Academic Calendar & Term Dates',
      'Student Extracurricular Clubs & Sports Teams',
      'Principal Welcome Note & Vision Statement',
      'Ready to Run Without Build Tooling'
    ]
  },
  {
    id: 'sathvika-school-3',
    name: 'Silver Oak Public School',
    category: 'School',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/Schoolpage 2',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/Schoolpage 2/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Responsive',
    icon: 'fa-book-open-reader',
    themeColor: '#0284C7',
    accentGradient: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
    description: 'Clean public school portal designed for parents and teachers, featuring homework notices, bus route tracking, and school events.',
    features: [
      'School Bus Routes & Transport Map',
      'Weekly Homework & Circular Noticeboard',
      'Teacher-Parent Communication Portal',
      'Instant Iframe Preview'
    ]
  },
  {
    id: 'sathvika-school-4',
    name: 'St. Xavier High School & Junior College',
    category: 'School',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/Schoolwebpages',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/Schoolwebpages/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Multi-section',
    icon: 'fa-bell',
    themeColor: '#4F46E5',
    accentGradient: 'linear-gradient(135deg, #4F46E5 0%, #3730A3 100%)',
    description: 'Traditional senior high school and junior college portal with honor rolls, board exam results, and athletic trophy showcase.',
    features: [
      'Junior College Stream Selection (Science, Commerce, Arts)',
      'Board Examination Merit Lists & Toppers',
      'Annual Sports Meet & Gallery',
      'Offline/Online Admission Form'
    ]
  },
  {
    id: 'sathvika-col-1',
    name: 'Royal College of Engineering & Tech',
    category: 'Degree & College',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/Collegepage1',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/Collegepage1/index.html',
    stacks: ['HTML5', 'CSS3', 'Node.js'],
    version: 'HTML5 • Interactive Form',
    icon: 'fa-gear',
    themeColor: '#DC2626',
    accentGradient: 'linear-gradient(135deg, #DC2626 0%, #991B1B 100%)',
    description: 'Polytechnic and engineering degree college website with interactive online application form, campus video, and placement statistics.',
    features: [
      'Complete Online Application & Course Selection Form',
      'Department Showcase (Mechanical, Civil, Computer Science)',
      'Campus Video Background & Placement Drive Stats',
      'Includes Local Node Express Server'
    ],
    featured: true
  },
  {
    id: 'sathvika-col-2',
    name: 'Cambridge Institute of Management',
    category: 'Degree & College',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/College2',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/College2/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Pure CSS',
    icon: 'fa-chart-line',
    themeColor: '#0D9488',
    accentGradient: 'linear-gradient(135deg, #0D9488 0%, #115E59 100%)',
    description: 'Business school and management college template featuring MBA programs, executive education, and corporate guest lectures.',
    features: [
      'MBA & Executive Management Curriculum',
      'Corporate Leadership & Guest Speaker Series',
      'Case Study Competition & Entrepreneurship Cell',
      'Instant Live Preview'
    ]
  },
  {
    id: 'sathvika-col-3',
    name: 'Oxford Metropolitan College',
    category: 'Degree & College',
    author: 'Sathvika',
    folderPath: 'sathvika/Schools-and-College-Templates/College3',
    type: 'static',
    entryHtml: 'sathvika/Schools-and-College-Templates/College3/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Pure CSS',
    icon: 'fa-landmark',
    themeColor: '#2563EB',
    accentGradient: 'linear-gradient(135deg, #2563EB 0%, #1E40AF 100%)',
    description: 'Historic metropolitan degree college website with academic departments, library archives, and international student exchange programs.',
    features: [
      'Academic Department Directory & Faculty Contacts',
      'Heritage Library & Online Archives Gateway',
      'Study Abroad & Student Exchange Programs',
      'Clean Semantic HTML5 Layout'
    ]
  },

  // --- Sravani: Templates ---
  {
    id: 'sravani-clg',
    name: 'Apex Degree & Engineering College',
    category: 'Degree & College',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/CLG',
    type: 'vite',
    entryHtml: 'sravani/TEMPLATES/CLG/preview.html',
    stacks: ['Vite', 'React', 'Tailwind'],
    version: 'Vite • Tailwind CSS',
    icon: 'fa-laptop-code',
    themeColor: '#4F46E5',
    accentGradient: 'linear-gradient(135deg, #4F46E5 0%, #312E81 100%)',
    description: 'Modern technical degree college web app with rich animated sections, department course grids, and automated inquiry modals.',
    features: [
      'Comprehensive Engineering Department Showcase',
      'Faculty Profile & Research Spotlight',
      'Student Placement Recruiters Wall',
      'Vite Fast Development Server Ready'
    ],
    port: 5182
  },
  {
    id: 'sravani-collage',
    name: 'Crestview University Academic Portal',
    category: 'Degree & College',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/COLLAGE',
    type: 'vite',
    entryHtml: 'sravani/TEMPLATES/COLLAGE/dist/index.html',
    stacks: ['Vite', 'React'],
    version: 'Vite • Modern Layout',
    icon: 'fa-graduation-cap',
    themeColor: '#0284C7',
    accentGradient: 'linear-gradient(135deg, #0284C7 0%, #075985 100%)',
    description: 'Modern university portal for undergraduate degree candidates with program details, academic calendar, and scholarship inquiry.',
    features: [
      'Undergraduate Course Syllabus & Eligibility',
      'Virtual Campus Video Tour',
      'Online Fees & Admission Guidance',
      'Optimized Vite Build'
    ]
  },
  {
    id: 'sravani-col-1',
    name: 'Heritage State College',
    category: 'Degree & College',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/COLLAGE 1',
    type: 'static',
    entryHtml: 'sravani/TEMPLATES/COLLAGE 1/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Responsive',
    icon: 'fa-monument',
    themeColor: '#B45309',
    accentGradient: 'linear-gradient(135deg, #B45309 0%, #78350F 100%)',
    description: 'Government-accredited degree college website with department information, syllabus downloads, and sports achievement gallery.',
    features: [
      'Affiliated University Syllabus PDF Downloads',
      'Sports & National Cadet Corps (NCC) Highlights',
      'Scholarship & Government Aid Details',
      'Instant Live Preview in Browser'
    ]
  },
  {
    id: 'sravani-col-2',
    name: 'Horizon Technical University',
    category: 'Degree & College',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/COLLAGE 2',
    type: 'static',
    entryHtml: 'sravani/TEMPLATES/COLLAGE 2/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Multi-page',
    icon: 'fa-network-wired',
    themeColor: '#059669',
    accentGradient: 'linear-gradient(135deg, #059669 0%, #064E3B 100%)',
    description: 'Autonomous technical university website with department labs, research grants, syllabus viewer, and student notices.',
    features: [
      'Autonomous Engineering Syllabus Viewer',
      'Research Grants & Patent Publications',
      'Examinations Results Portal Link',
      'Fast Static HTML5'
    ]
  },
  {
    id: 'sravani-school-1',
    name: 'Pinegrove High School & Montessori',
    category: 'School',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/SCHOOL1',
    type: 'static',
    entryHtml: 'sravani/TEMPLATES/SCHOOL1/index.html',
    stacks: ['HTML5', 'CSS3', 'JavaScript'],
    version: 'HTML5 • Live Demo',
    icon: 'fa-tree',
    themeColor: '#15803D',
    accentGradient: 'linear-gradient(135deg, #15803D 0%, #166534 100%)',
    description: 'Vibrant school website with interactive picture gallery, student club profiles, school anthem, and online registration form.',
    features: [
      'Pre-Primary to High School Curriculum Guide',
      'School Activity Photo & Video Gallery',
      'Student Council & House System Spotlight',
      'Instant In-Browser Live Preview'
    ],
    featured: true
  },
  {
    id: 'sravani-school-2',
    name: 'Sunrise Valley Public School',
    category: 'School',
    author: 'Sravani',
    folderPath: 'sravani/TEMPLATES/SCHOOL2',
    type: 'static',
    entryHtml: 'sravani/TEMPLATES/SCHOOL2/index.html',
    stacks: ['HTML5', 'CSS3'],
    version: 'HTML5 • Clean CSS',
    icon: 'fa-sun',
    themeColor: '#F59E0B',
    accentGradient: 'linear-gradient(135deg, #F59E0B 0%, #B45309 100%)',
    description: 'Bright and engaging school template focusing on holistic child development, academic excellence, and sports facilities.',
    features: [
      'Early Childhood Learning & Kindergarten Portal',
      'Annual Athletic Meet & Art Exhibition Showcase',
      'Parent Feedback & Testimonials Carousel',
      'Instant Live Preview in Browser'
    ]
  }
];

// Contributor metadata & avatar colors
const AUTHOR_COLORS = {
  'Akbar': { bg: '#2563EB', initial: 'AK' },
  'Disha': { bg: '#8B5CF6', initial: 'DI' },
  'Poorvisha': { bg: '#0EA5E9', initial: 'PO' },
  'Sathvika': { bg: '#10B981', initial: 'SA' },
  'Sravani': { bg: '#F59E0B', initial: 'SR' }
};

// =============================================================================
// 3. CORE UTILITY FUNCTIONS
// =============================================================================

function showToast(message, type = 'info', icon = 'fa-circle-info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success', 'fa-check');
    }).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg, 'success', 'fa-check');
  } catch (err) {
    showToast('Failed to copy', 'info');
  }
  document.body.removeChild(ta);
}

function getRepoDetails() {
  const rawUrl = AppConfig.repoUrl.replace(/\/+$/, '');
  const parts = rawUrl.split('/');
  const repo = parts[parts.length - 1] || 'templates';
  const owner = parts[parts.length - 2] || 'ottobon';
  return { owner, repo, rawUrl, branch: AppConfig.branch || 'main' };
}

// Download URL generators
function getFolderZipUrl(folderPath) {
  const { rawUrl, branch } = getRepoDetails();
  // Using download-directory.github.io service to zip and download single folder from GitHub
  const treeUrl = `${rawUrl}/tree/${branch}/${folderPath}`;
  return `https://download-directory.github.io/?url=${encodeURIComponent(treeUrl)}`;
}

function getFullRepoZipUrl() {
  const { rawUrl, branch } = getRepoDetails();
  return `${rawUrl}/archive/refs/heads/${branch}.zip`;
}

function getGithubFolderUrl(folderPath) {
  const { rawUrl, branch } = getRepoDetails();
  return `${rawUrl}/tree/${branch}/${folderPath}`;
}

// =============================================================================
// 4. TEMPLATE RENDERING & GRID MANAGEMENT
// =============================================================================

function filterTemplates() {
  return TEMPLATES.filter(tpl => {
    // 1. Category Filter
    if (AppState.activeCategory !== 'all') {
      if (tpl.category !== AppState.activeCategory) return false;
    }

    // 2. Tech Stack Filter
    if (AppState.activeStacks.size > 0) {
      const hasStack = tpl.stacks.some(st => AppState.activeStacks.has(st));
      if (!hasStack) return false;
    }

    // 3. Author Filter
    if (AppState.activeAuthors.size > 0) {
      if (!AppState.activeAuthors.has(tpl.author)) return false;
    }

    // 4. Search Query
    if (AppState.searchQuery) {
      const q = AppState.searchQuery.toLowerCase();
      const matchName = tpl.name.toLowerCase().includes(q);
      const matchDesc = tpl.description.toLowerCase().includes(q);
      const matchAuthor = tpl.author.toLowerCase().includes(q);
      const matchStack = tpl.stacks.some(s => s.toLowerCase().includes(q));
      const matchCategory = tpl.category.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchAuthor && !matchStack && !matchCategory) {
        return false;
      }
    }

    return true;
  });
}

function sortTemplates(templates) {
  const sorted = [...templates];
  switch (AppState.sortBy) {
    case 'featured':
      return sorted.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    case 'name-asc':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return sorted.sort((a, b) => b.name.localeCompare(a.name));
    case 'author':
      return sorted.sort((a, b) => a.author.localeCompare(b.author));
    case 'bookmarks':
      return sorted.sort((a, b) => {
        const aSaved = AppState.savedTemplates.has(a.id) ? 1 : 0;
        const bSaved = AppState.savedTemplates.has(b.id) ? 1 : 0;
        return bSaved - aSaved;
      });
    default:
      return sorted;
  }
}

function renderTemplateCard(tpl) {
  const isSaved = AppState.savedTemplates.has(tpl.id);
  const authorInfo = AUTHOR_COLORS[tpl.author] || { bg: '#64748B', initial: tpl.author.substring(0, 2).toUpperCase() };
  
  const categoryClass = tpl.category === 'Healthcare' 
    ? 'healthcare' 
    : (tpl.category === 'Degree & College' ? 'college' : 'school');

  // Stacks pills HTML
  const stacksHtml = tpl.stacks.map(st => `<span class="stack-pill">${st}</span>`).join('');

  return `
    <article class="template-card" data-id="${tpl.id}">
      
      <!-- Visual Card Thumbnail -->
      <div class="card-thumbnail-wrap">
        <span class="card-category-badge ${categoryClass}">${tpl.category}</span>
        
        <button class="card-bookmark-btn ${isSaved ? 'saved' : ''}" data-id="${tpl.id}" title="${isSaved ? 'Remove from saved' : 'Save to bookmarks'}">
          <i class="${isSaved ? 'fa-solid' : 'fa-regular'} fa-heart"></i>
        </button>

        <!-- Simulated Visual Canvas Preview -->
        <div class="card-thumbnail-canvas" style="background: ${tpl.accentGradient}; color: #FFFFFF;">
          <div class="canvas-browser-bar">
            <span class="dot r"></span>
            <span class="dot y"></span>
            <span class="dot g"></span>
            <span class="url-slug">${tpl.folderPath}</span>
          </div>

          <div class="canvas-center-badge">
            <div class="canvas-logo-icon" style="background: rgba(255, 255, 255, 0.2); backdrop-filter: blur(8px);">
              <i class="fa-solid ${tpl.icon}"></i>
            </div>
            <span class="canvas-hero-text">${tpl.name}</span>
          </div>

          <div class="canvas-bottom-stats">
            <span><i class="fa-solid fa-code-branch"></i> ${tpl.version}</span>
            <span><i class="fa-solid fa-shield-halved"></i> Production Ready</span>
          </div>
        </div>

        <!-- Hover Overlay CTA -->
        <div class="card-hover-overlay">
          <button class="overlay-btn preview" data-preview-id="${tpl.id}">
            <i class="fa-solid fa-eye"></i> Live Preview
          </button>
          <button class="overlay-btn download" data-download-id="${tpl.id}">
            <i class="fa-solid fa-download"></i> Download
          </button>
        </div>
      </div>

      <!-- Card Content Info -->
      <div class="card-body">
        <div class="card-header-line">
          <h3 class="card-title">${tpl.name}</h3>
        </div>

        <div class="card-author-pill">
          <span class="author-avatar" style="background-color: ${authorInfo.bg};">${authorInfo.initial}</span>
          <span>By ${tpl.author}</span>
          <span>•</span>
          <span class="type-pill">${tpl.type === 'nextjs' ? 'Next.js' : (tpl.type === 'vite' ? 'Vite' : 'HTML5')}</span>
        </div>

        <p class="card-description">${tpl.description}</p>

        <div class="card-stack-pills">
          ${stacksHtml}
        </div>
      </div>

      <!-- Card Action Footer -->
      <div class="card-footer">
        <button class="btn btn-primary" data-preview-id="${tpl.id}">
          <i class="fa-solid fa-desktop"></i>
          <span>Inspect Preview</span>
        </button>
        <div class="card-footer-mini-btns">
          <button class="icon-square-btn" data-download-id="${tpl.id}" title="Download Options">
            <i class="fa-solid fa-download"></i>
          </button>
          <button class="icon-square-btn" data-copy-id="${tpl.id}" title="Copy Git Clone Command">
            <i class="fa-regular fa-copy"></i>
          </button>
        </div>
      </div>

    </article>
  `;
}

function renderGrid() {
  const container = document.getElementById('templatesGrid');
  const emptyState = document.getElementById('emptyState');
  const resultsCount = document.getElementById('resultsCount');
  if (!container) return;

  const filtered = filterTemplates();
  const sorted = sortTemplates(filtered);

  if (resultsCount) resultsCount.textContent = sorted.length;

  if (sorted.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
  } else {
    emptyState.style.display = 'none';
    container.innerHTML = sorted.map(renderTemplateCard).join('');
  }

  // Update layout mode
  if (AppState.viewMode === 'compact') {
    container.classList.add('compact-view');
  } else {
    container.classList.remove('compact-view');
  }

  attachCardEvents();
  renderActiveFilterTags();
}

function renderActiveFilterTags() {
  const container = document.getElementById('activeFilterTags');
  if (!container) return;

  const tags = [];

  if (AppState.activeCategory !== 'all') {
    tags.push(`Category: ${AppState.activeCategory}`);
  }

  AppState.activeStacks.forEach(st => tags.push(`Stack: ${st}`));
  AppState.activeAuthors.forEach(au => tags.push(`Author: ${au}`));

  if (AppState.searchQuery) {
    tags.push(`Search: "${AppState.searchQuery}"`);
  }

  if (tags.length === 0) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = tags.map(tag => `
    <span class="filter-tag">
      ${tag}
    </span>
  `).join('');
}

// =============================================================================
// 5. INTERACTIVE LIVE PREVIEW MODAL
// =============================================================================

function openPreviewModal(templateId) {
  const tpl = TEMPLATES.find(t => t.id === templateId);
  if (!tpl) return;

  AppState.currentModalTemplate = tpl;
  const modal = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  const frameworkScreen = document.getElementById('frameworkPreviewScreen');
  const loading = document.getElementById('previewLoading');

  // Fill in Header & Meta details
  document.getElementById('modalTemplateName').textContent = tpl.name;
  document.getElementById('modalCategoryBadge').textContent = tpl.category;
  document.getElementById('modalAuthorTag').textContent = `By ${tpl.author} • ${tpl.version}`;
  document.getElementById('modalDescription').textContent = tpl.description;
  document.getElementById('modalFolderPath').textContent = tpl.folderPath;
  document.getElementById('mockBrowserUrl').textContent = `https://ottobon-templates.dev/${tpl.folderPath}`;

  // Tech tags cloud
  const tagsContainer = document.getElementById('modalTechTags');
  tagsContainer.innerHTML = tpl.stacks.map(st => `<span class="stack-pill">${st}</span>`).join('');

  // Features list
  const featuresContainer = document.getElementById('modalFeaturesList');
  featuresContainer.innerHTML = tpl.features.map(f => `
    <li><i class="fa-solid fa-circle-check"></i> <span>${f}</span></li>
  `).join('');

  // Terminal commands
  const terminalCode = document.getElementById('modalRunCode');
  const { rawUrl } = getRepoDetails();
  terminalCode.textContent = `# 1. Clone repository
git clone ${rawUrl}
cd templates/${tpl.folderPath}

# 2. Install dependencies & run
npm install
npm run dev`;

  // External window link
  const openExternalBtn = document.getElementById('modalOpenExternalBtn');

  // Reset mode switcher buttons
  const btnPreviewStatic = document.getElementById('btnPreviewStatic');
  const btnPreviewDevServer = document.getElementById('btnPreviewDevServer');
  if (btnPreviewStatic && btnPreviewDevServer) {
    btnPreviewStatic.classList.add('active');
    btnPreviewDevServer.classList.remove('active');
    btnPreviewDevServer.querySelector('span').textContent = `Dev Server (:${tpl.port || 5173})`;
  }

  // Preview logic: For Next.js projects, show architecture & setup guide (no fake preview).
  // For templates with actual web pages (HTML / Vite builds), render live in iframe!
  if (!tpl.entryHtml || tpl.type === 'nextjs') {
    iframe.style.display = 'none';
    loading.style.display = 'none';
    frameworkScreen.style.display = 'flex';

    frameworkScreen.innerHTML = `
      <div class="framework-screen-hero">
        <div class="framework-icon-large" style="background: ${tpl.accentGradient}; color: #FFFFFF;">
          <i class="fa-solid ${tpl.icon}"></i>
        </div>
        <h3 style="font-size: 1.4rem; font-weight: 800; color: var(--text-primary); margin-top: 12px;">${tpl.name}</h3>
        <p style="font-size: 0.92rem; color: var(--text-secondary); max-width: 480px; margin-top: 6px;">${tpl.description}</p>
        
        <div class="framework-badge-row">
          <span class="stack-pill" style="background: var(--accent-blue-light); color: var(--accent-blue); font-weight: 700;">
            <i class="fa-brands fa-react"></i> Next.js 16 (App Router)
          </span>
          <span class="stack-pill" style="background: var(--color-indigo-bg); color: var(--color-indigo); font-weight: 700;">
            <i class="fa-solid fa-server"></i> Full-Stack / SSR Architecture
          </span>
        </div>
      </div>

      <div class="framework-features-box">
        <h5>Key Capabilities & Architecture</h5>
        <ul>
          ${tpl.features.map(f => `<li><i class="fa-solid fa-check"></i> ${f}</li>`).join('')}
        </ul>
      </div>

      <div style="background: #0F172A; color: #E2E8F0; padding: 14px 20px; border-radius: var(--radius-md); font-family: monospace; font-size: 0.8rem; text-align: left; max-width: 480px; width: 100%;">
        <div style="color: #94A3B8; font-size: 0.72rem; margin-bottom: 6px;"># Run this Next.js app locally:</div>
        <div>cd templates/${tpl.folderPath}</div>
        <div>npm install</div>
        <div>npm run dev</div>
      </div>

      <div style="display: flex; gap: 12px; margin-top: 10px;">
        <button class="btn btn-primary" onclick="openDownloadModal('${tpl.id}')">
          <i class="fa-solid fa-download"></i> Download This Repo
        </button>
        <button class="btn btn-outline" onclick="copyToClipboard('cd templates/${tpl.folderPath} && npm install && npm run dev', 'Commands copied to clipboard!')">
          <i class="fa-regular fa-copy"></i> Copy Run Commands
        </button>
      </div>
    `;

    if (openExternalBtn) openExternalBtn.style.display = 'none';
  } else {
    frameworkScreen.style.display = 'none';
    iframe.style.display = 'block';
    loading.style.display = 'flex';

    iframe.onload = () => {
      loading.style.display = 'none';
    };
    iframe.src = tpl.entryHtml;

    if (openExternalBtn) {
      openExternalBtn.style.display = 'inline-flex';
      openExternalBtn.href = tpl.entryHtml;
    }
  }

  // Open modal
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closePreviewModal() {
  const modal = document.getElementById('previewModal');
  const iframe = document.getElementById('previewIframe');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  iframe.src = 'about:blank';
  AppState.currentModalTemplate = null;
  document.body.style.overflow = '';
}

function setDeviceView(device) {
  AppState.currentDevice = device;
  const frame = document.getElementById('deviceFrame');
  const buttons = document.querySelectorAll('.device-btn');

  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.device === device);
  });

  frame.classList.remove('tablet', 'mobile');
  if (device === 'tablet') frame.classList.add('tablet');
  if (device === 'mobile') frame.classList.add('mobile');
}

// =============================================================================
// 6. DOWNLOAD MODAL & ACTIONS
// =============================================================================

function openDownloadModal(templateId) {
  const tpl = TEMPLATES.find(t => t.id === templateId) || AppState.currentModalTemplate;
  if (!tpl) return;

  const modal = document.getElementById('downloadModal');
  const title = document.getElementById('downloadModalTitle');
  const intro = document.getElementById('downloadModalIntro');

  title.textContent = `Download: ${tpl.name}`;
  intro.textContent = `Folder: ${tpl.folderPath} (${tpl.version})`;

  // Option 1: Direct Folder ZIP
  const optFolderZip = document.getElementById('optFolderZip');
  optFolderZip.onclick = () => {
    const downloadUrl = getFolderZipUrl(tpl.folderPath);
    showToast(`Downloading folder archive for "${tpl.name}"...`, 'info', 'fa-cloud-arrow-down');
    window.open(downloadUrl, '_blank');
    closeDownloadModal();
  };

  // Option 2: Full Repo ZIP
  const optFullRepoZip = document.getElementById('optFullRepoZip');
  optFullRepoZip.onclick = () => {
    const downloadUrl = getFullRepoZipUrl();
    showToast('Downloading entire repository archive...', 'info', 'fa-file-zipper');
    window.open(downloadUrl, '_blank');
    closeDownloadModal();
  };

  // Option 3: Git Clone
  const optGitClone = document.getElementById('optGitClone');
  optGitClone.onclick = () => {
    const { rawUrl } = getRepoDetails();
    const cmd = `git clone ${rawUrl}\ncd templates/${tpl.folderPath}\nnpm install\nnpm run dev`;
    copyToClipboard(cmd, 'Git clone & setup commands copied!');
    closeDownloadModal();
  };

  // Option 4: View on GitHub
  const optViewGithub = document.getElementById('optViewGithub');
  optViewGithub.href = getGithubFolderUrl(tpl.folderPath);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeDownloadModal() {
  const modal = document.getElementById('downloadModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

// =============================================================================
// 7. REPOSITORY CONFIGURATION MODAL
// =============================================================================

function openRepoSettingsModal() {
  const modal = document.getElementById('repoSettingsModal');
  document.getElementById('cfgRepoUrl').value = AppConfig.repoUrl;
  document.getElementById('cfgBranch').value = AppConfig.branch;
  document.getElementById('cfgLocalPort').value = AppConfig.localPort;
  modal.classList.add('open');
}

function closeRepoSettingsModal() {
  const modal = document.getElementById('repoSettingsModal');
  modal.classList.remove('open');
}

function saveRepoSettings(e) {
  e.preventDefault();
  const repoUrl = document.getElementById('cfgRepoUrl').value.trim();
  const branch = document.getElementById('cfgBranch').value.trim() || 'main';
  const localPort = parseInt(document.getElementById('cfgLocalPort').value, 10) || 3000;

  if (!repoUrl) {
    showToast('Please enter a valid GitHub repository URL', 'info');
    return;
  }

  AppConfig = { repoUrl, branch, localPort };
  localStorage.setItem('ottobon_templates_config', JSON.stringify(AppConfig));

  updateRepoStatusUI();
  closeRepoSettingsModal();
  showToast('Repository configuration saved successfully!', 'success', 'fa-check');
}

function resetRepoDefaults() {
  AppConfig = { ...DEFAULT_CONFIG };
  localStorage.removeItem('ottobon_templates_config');
  document.getElementById('cfgRepoUrl').value = AppConfig.repoUrl;
  document.getElementById('cfgBranch').value = AppConfig.branch;
  document.getElementById('cfgLocalPort').value = AppConfig.localPort;
  updateRepoStatusUI();
  showToast('Settings reset to defaults', 'info');
}

function updateRepoStatusUI() {
  const { owner, repo } = getRepoDetails();
  const label = document.getElementById('currentRepoLabel');
  if (label) label.textContent = `${owner}/${repo}`;

  const gitBoxPreview = document.querySelector('.git-url-preview');
  if (gitBoxPreview) gitBoxPreview.textContent = AppConfig.repoUrl;
}

// =============================================================================
// 8. EVENT ATTACHMENT & USER INTERACTIONS
// =============================================================================

function attachCardEvents() {
  // Preview Buttons
  document.querySelectorAll('[data-preview-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openPreviewModal(btn.dataset.previewId);
    });
  });

  // Download Buttons
  document.querySelectorAll('[data-download-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDownloadModal(btn.dataset.downloadId);
    });
  });

  // Copy Git Clone Buttons
  document.querySelectorAll('[data-copy-id]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const tpl = TEMPLATES.find(t => t.id === btn.dataset.copyId);
      if (tpl) {
        const { rawUrl } = getRepoDetails();
        const cmd = `git clone ${rawUrl}\ncd templates/${tpl.folderPath}`;
        copyToClipboard(cmd, `Cloning command for "${tpl.name}" copied!`);
      }
    });
  });

  // Bookmark Buttons
  document.querySelectorAll('.card-bookmark-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (AppState.savedTemplates.has(id)) {
        AppState.savedTemplates.delete(id);
        btn.classList.remove('saved');
        btn.innerHTML = '<i class="fa-regular fa-heart"></i>';
        showToast('Removed from saved bookmarks', 'info');
      } else {
        AppState.savedTemplates.add(id);
        btn.classList.add('saved');
        btn.innerHTML = '<i class="fa-solid fa-heart"></i>';
        showToast('Added to saved bookmarks ❤️', 'success', 'fa-heart');
      }
      localStorage.setItem('ottobon_saved_templates', JSON.stringify([...AppState.savedTemplates]));
      updateBookmarkCounter();
    });
  });
}

function updateBookmarkCounter() {
  const el = document.getElementById('bookmarkCount');
  if (el) el.textContent = AppState.savedTemplates.size;
}

function setupEventListeners() {
  // Global Search Input
  const searchInput = document.getElementById('globalSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      AppState.searchQuery = e.target.value.trim();
      if (clearSearchBtn) {
        clearSearchBtn.style.display = AppState.searchQuery ? 'flex' : 'none';
      }
      renderGrid();
    });

    // Keyboard shortcut '/'
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      if (e.key === 'Escape') {
        closePreviewModal();
        closeDownloadModal();
        closeRepoSettingsModal();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      AppState.searchQuery = '';
      clearSearchBtn.style.display = 'none';
      renderGrid();
      searchInput.focus();
    });
  }

  // Quick Chips Bar
  document.querySelectorAll('#quickChipsBar .chip-item').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#quickChipsBar .chip-item').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      const cat = chip.dataset.category;
      AppState.activeCategory = cat;

      // Sync with sidebar radio
      const radio = document.querySelector(`input[name="categoryFilter"][value="${cat}"]`);
      if (radio) radio.checked = true;

      renderGrid();
    });
  });

  // Sidebar Category Radio
  document.querySelectorAll('input[name="categoryFilter"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      AppState.activeCategory = e.target.value;
      // Sync with quick chips
      document.querySelectorAll('#quickChipsBar .chip-item').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.category === e.target.value);
      });
      renderGrid();
    });
  });

  // Stack Checkboxes
  document.querySelectorAll('input[name="stackFilter"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        AppState.activeStacks.add(cb.value);
      } else {
        AppState.activeStacks.delete(cb.value);
      }
      renderGrid();
    });
  });

  // Author Checkboxes
  document.querySelectorAll('input[name="authorFilter"]').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) {
        AppState.activeAuthors.add(cb.value);
      } else {
        AppState.activeAuthors.delete(cb.value);
      }
      renderGrid();
    });
  });

  // Reset Filters
  const resetFiltersBtn = document.getElementById('resetFiltersBtn');
  const emptyResetBtn = document.getElementById('emptyResetBtn');

  const resetAll = () => {
    AppState.activeCategory = 'all';
    AppState.activeStacks.clear();
    AppState.activeAuthors.clear();
    AppState.searchQuery = '';

    const firstRadio = document.querySelector('input[name="categoryFilter"][value="all"]');
    if (firstRadio) firstRadio.checked = true;

    document.querySelectorAll('input[name="stackFilter"]').forEach(c => c.checked = false);
    document.querySelectorAll('input[name="authorFilter"]').forEach(c => c.checked = false);

    document.querySelectorAll('#quickChipsBar .chip-item').forEach(c => {
      c.classList.toggle('active', c.dataset.category === 'all');
    });

    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.style.display = 'none';

    renderGrid();
    showToast('All filters have been reset', 'info');
  };

  if (resetFiltersBtn) resetFiltersBtn.addEventListener('click', resetAll);
  if (emptyResetBtn) emptyResetBtn.addEventListener('click', resetAll);

  // Sort Dropdown
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      AppState.sortBy = e.target.value;
      renderGrid();
    });
  }

  // View Layout Toggles
  const viewGridBtn = document.getElementById('viewGridBtn');
  const viewCompactBtn = document.getElementById('viewCompactBtn');

  if (viewGridBtn && viewCompactBtn) {
    viewGridBtn.addEventListener('click', () => {
      AppState.viewMode = 'grid';
      viewGridBtn.classList.add('active');
      viewCompactBtn.classList.remove('active');
      renderGrid();
    });
    viewCompactBtn.addEventListener('click', () => {
      AppState.viewMode = 'compact';
      viewCompactBtn.classList.add('active');
      viewGridBtn.classList.remove('active');
      renderGrid();
    });
  }

  // Device Switcher in Modal
  document.querySelectorAll('.device-btn').forEach(btn => {
    btn.addEventListener('click', () => setDeviceView(btn.dataset.device));
  });

  // Modal Closers
  const modalCloseBtn = document.getElementById('modalCloseBtn');
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closePreviewModal);

  const downloadModalCloseBtn = document.getElementById('downloadModalCloseBtn');
  if (downloadModalCloseBtn) downloadModalCloseBtn.addEventListener('click', closeDownloadModal);

  const repoSettingsCloseBtn = document.getElementById('repoSettingsCloseBtn');
  if (repoSettingsCloseBtn) repoSettingsCloseBtn.addEventListener('click', closeRepoSettingsModal);

  // Close modals on clicking backdrop
  document.querySelectorAll('.modal-backdrop').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
      }
    });
  });

  // Modal Action Buttons
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');
  if (modalDownloadBtn) {
    modalDownloadBtn.addEventListener('click', () => {
      if (AppState.currentModalTemplate) {
        openDownloadModal(AppState.currentModalTemplate.id);
      }
    });
  }

  const modalDirectDownloadBtn = document.getElementById('modalDirectDownloadBtn');
  if (modalDirectDownloadBtn) {
    modalDirectDownloadBtn.addEventListener('click', () => {
      if (AppState.currentModalTemplate) {
        const url = getFolderZipUrl(AppState.currentModalTemplate.folderPath);
        showToast(`Downloading "${AppState.currentModalTemplate.name}" ZIP...`, 'info', 'fa-cloud-arrow-down');
        window.open(url, '_blank');
      }
    });
  }

  const modalRepoDownloadBtn = document.getElementById('modalRepoDownloadBtn');
  if (modalRepoDownloadBtn) {
    modalRepoDownloadBtn.addEventListener('click', () => {
      const url = getFullRepoZipUrl();
      showToast('Downloading entire repository archive...', 'info', 'fa-file-zipper');
      window.open(url, '_blank');
    });
  }

  const copyTerminalBtn = document.getElementById('copyTerminalBtn');
  if (copyTerminalBtn) {
    copyTerminalBtn.addEventListener('click', () => {
      const code = document.getElementById('modalRunCode').textContent;
      copyToClipboard(code, 'Run commands copied to clipboard!');
    });
  }

  const previewRefreshBtn = document.getElementById('previewRefreshBtn');
  if (previewRefreshBtn) {
    previewRefreshBtn.addEventListener('click', () => {
      const iframe = document.getElementById('previewIframe');
      if (iframe && iframe.src) {
        iframe.src = iframe.src;
        showToast('Reloading preview...', 'info', 'fa-rotate-right');
      }
    });
  }

  // Preview Mode Switcher (Static vs Dev Server)
  const btnPreviewStatic = document.getElementById('btnPreviewStatic');
  const btnPreviewDevServer = document.getElementById('btnPreviewDevServer');

  if (btnPreviewStatic && btnPreviewDevServer) {
    btnPreviewStatic.addEventListener('click', () => {
      btnPreviewStatic.classList.add('active');
      btnPreviewDevServer.classList.remove('active');
      if (AppState.currentModalTemplate) {
        const iframe = document.getElementById('previewIframe');
        iframe.src = AppState.currentModalTemplate.entryHtml;
        document.getElementById('mockBrowserUrl').textContent = `https://preview.ottobon.local/${AppState.currentModalTemplate.folderPath}`;
        showToast('Viewing standalone interactive preview', 'info', 'fa-eye');
      }
    });

    btnPreviewDevServer.addEventListener('click', () => {
      btnPreviewDevServer.classList.add('active');
      btnPreviewStatic.classList.remove('active');
      if (AppState.currentModalTemplate) {
        const port = AppState.currentModalTemplate.port || 5173;
        const devUrl = `http://localhost:${port}`;
        const iframe = document.getElementById('previewIframe');
        iframe.src = devUrl;
        document.getElementById('mockBrowserUrl').textContent = devUrl;
        showToast(`Connecting to local dev server at ${devUrl}... (Ensure 'npm run dev' is started)`, 'info', 'fa-bolt');
      }
    });
  }

  // Full Repo Download Header Button
  const downloadFullRepoBtn = document.getElementById('downloadFullRepoBtn');
  if (downloadFullRepoBtn) {
    downloadFullRepoBtn.addEventListener('click', () => {
      const url = getFullRepoZipUrl();
      showToast('Downloading entire repository archive as ZIP...', 'info', 'fa-cloud-arrow-down');
      window.open(url, '_blank');
    });
  }

  // Quick Git Clone in sidebar
  const copyGitCloneQuick = document.getElementById('copyGitCloneQuick');
  if (copyGitCloneQuick) {
    copyGitCloneQuick.addEventListener('click', () => {
      const cmd = `git clone ${AppConfig.repoUrl}`;
      copyToClipboard(cmd, 'Git clone command copied!');
    });
  }

  // Saved Bookmarks Button in Navbar
  const savedBookmarksBtn = document.getElementById('savedBookmarksBtn');
  if (savedBookmarksBtn) {
    savedBookmarksBtn.addEventListener('click', () => {
      if (AppState.savedTemplates.size === 0) {
        showToast('You haven\'t saved any templates yet. Click the heart icon on any card!', 'info');
        return;
      }
      AppState.sortBy = 'bookmarks';
      sortSelect.value = 'bookmarks';
      renderGrid();
      showToast('Showing your saved bookmarked templates first ❤️', 'info', 'fa-heart');
    });
  }

  // Repo Settings Modals
  const repoSettingsBtn = document.getElementById('repoSettingsBtn');
  if (repoSettingsBtn) repoSettingsBtn.addEventListener('click', openRepoSettingsModal);

  const repoStatusBadge = document.getElementById('repoStatusBadge');
  if (repoStatusBadge) repoStatusBadge.addEventListener('click', openRepoSettingsModal);

  const footerConfigLink = document.getElementById('footerConfigLink');
  if (footerConfigLink) footerConfigLink.addEventListener('click', (e) => {
    e.preventDefault();
    openRepoSettingsModal();
  });

  const repoSettingsForm = document.getElementById('repoSettingsForm');
  if (repoSettingsForm) repoSettingsForm.addEventListener('submit', saveRepoSettings);

  const resetRepoDefaultsBtn = document.getElementById('resetRepoDefaultsBtn');
  if (resetRepoDefaultsBtn) resetRepoDefaultsBtn.addEventListener('click', resetRepoDefaults);

  // Navbar scroll shadow
  window.addEventListener('scroll', () => {
    const nav = document.getElementById('topNavbar');
    if (nav) {
      nav.classList.toggle('scrolled', window.scrollY > 20);
    }
  });
}

// =============================================================================
// 9. APP INITIALIZATION
// =============================================================================

document.addEventListener('DOMContentLoaded', () => {
  updateRepoStatusUI();
  updateBookmarkCounter();
  setupEventListeners();
  renderGrid();
  console.log('Ottobon Templates Hub initialized with 28 templates.');
});
