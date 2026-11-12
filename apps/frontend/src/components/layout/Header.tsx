'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Header() {
  const pathname = usePathname();

  const isAuthPage = pathname === '/login';

  const baseNavigation = [
    { name: 'Library', href: '/library' },
    { name: 'Workspace', href: '/workspace' },
    { name: 'Campaigns', href: '/campaigns' },
    { name: 'Content Calendar', href: '/calendar' },
    { name: 'Brand Kits', href: '/brand-kits' },
    { name: 'Add Asset', href: '/add' },
  ];

  return (
    <header className="bg-white border-b border-border sticky top-0 z-40 w-full">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/library" className="flex items-center gap-2 font-bold text-lg text-primary focus-ring rounded">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>
            <span className="hidden sm:inline-block tracking-tight text-slate-900">sBLOOM Hub</span>
          </Link>

          {!isAuthPage && (
            <nav className="hidden md:flex items-center space-x-1">
              {baseNavigation.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors focus-ring ${
                      isActive 
                        ? 'bg-slate-100 text-slate-900' 
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          )}
        </div>
        
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
            Organization Workspace
          </span>
        </div>
      </div>
      
      {/* Mobile navigation bar */}
      {!isAuthPage && (
        <div className="md:hidden border-t border-border bg-slate-50/80 px-4 py-2 flex justify-between overflow-x-auto">
          {baseNavigation.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap focus-ring ${
                  isActive 
                    ? 'bg-white shadow-sm text-primary border border-border/50' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      )}
    </header>
  );
}

