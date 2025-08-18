import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Define routes that should be logged
const LOGGED_ROUTES = [
  '/',
  '/repository',
  '/scan-setup',
  '/audit-logs',
  '/image/',
  '/bulk-scan/',
  '/library/',
  '/schedules/',
  '/templates/'
];

// Define routes that should be excluded from logging
const EXCLUDED_ROUTES = [
  '/api/',
  '/_next/',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml'
];

function shouldLogRoute(pathname: string): boolean {
  // Exclude API routes and static assets
  if (EXCLUDED_ROUTES.some(route => pathname.startsWith(route))) {
    return false;
  }
  
  // Include specific routes or route patterns
  return LOGGED_ROUTES.some(route => 
    pathname === route || pathname.startsWith(route)
  );
}

function getUserIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');
  
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  if (realIp) {
    return realIp;
  }
  
  if (cfConnectingIp) {
    return cfConnectingIp;
  }
  
  return 'unknown';
}

async function logPageView(request: NextRequest, pathname: string) {
  try {
    const userIp = getUserIp(request);
    const userAgent = request.headers.get('user-agent') || '';
    
    // Make an API call to log the page view
    const baseUrl = request.nextUrl.origin;
    await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType: 'page_view',
        category: 'informative',
        userIp,
        userAgent,
        resource: pathname,
        action: `User loaded ${pathname}`,
        details: { pathname },
        metadata: {
          method: request.method,
          url: request.url,
          referer: request.headers.get('referer'),
          timestamp: new Date().toISOString(),
        }
      }),
    }).catch(error => {
      console.error('Failed to log page view:', error);
    });
  } catch (error) {
    console.error('Failed to log page view:', error);
  }
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Log page views for relevant routes
  if (shouldLogRoute(pathname)) {
    // Don't await this to avoid slowing down the request
    logPageView(request, pathname);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/audit-logs (to avoid infinite loops)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api/audit-logs|_next/static|_next/image|favicon.ico).*)',
  ],
};