import { NextResponse } from 'next/server';
import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET || "development-secret-do-not-use-in-production" });
  
  const isAuthPage = request.nextUrl.pathname.startsWith('/login');
  
  if (isAuthPage) {
    if (token) {
      return NextResponse.redirect(new URL('/library', request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    let from = request.nextUrl.pathname;
    if (request.nextUrl.search) {
      from += request.nextUrl.search;
    }
    
    return NextResponse.redirect(
      new URL(`/login?from=${encodeURIComponent(from)}`, request.url)
    );
  }
  
  // Basic server-side role authorization checks
  const role = token.role as string;
  const path = request.nextUrl.pathname;
  
  // Protect /add route to only ADMIN and CONTRIBUTOR
  if (path.startsWith('/add')) {
    if (role !== 'ADMIN' && role !== 'CONTRIBUTOR') {
      return NextResponse.redirect(new URL('/library', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/library/:path*', '/my-work/:path*', '/add/:path*', '/login'],
};
