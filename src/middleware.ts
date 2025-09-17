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
  // Check if DEMO_MODE is enabled
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    return 'DEMO_PROTECT';
  }

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
    const port = process.env.PORT || '3000';
    const baseUrl = process.env.HOSTNAME 
      ? `http://${process.env.HOSTNAME}:${port}`
      : request.nextUrl.origin;
    await fetch(`${baseUrl}/api/audit-logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        eventType: 'SYSTEM_EVENT',
        category: 'INFORMATIVE',
        userIp,
        userAgent,
        resource: pathname,
        action: 'VIEW',
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
  const method = request.method;
  
  // Skip audit-logs to avoid infinite loops
  if (pathname.startsWith('/api/audit-logs')) {
    return NextResponse.next();
  }
  
  // Check for demo mode - block all write operations
  if (process.env.NEXT_PUBLIC_DEMO_MODE === 'true') {
    const isApiRoute = pathname.startsWith('/api/');
    const host = request.headers.get('host');
    const hostname = process.env.HOSTNAME;
    const isLocalhost = host?.includes('localhost') || host?.includes('127.0.0.1');
    const isContainerHost = hostname && host?.includes(hostname);
    
    // Block POST, PUT, DELETE, PATCH operations in demo mode (except from localhost or container hostname)
    if (isApiRoute && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(method) && !isLocalhost && !isContainerHost) {
      console.log(`[Demo Mode] Blocking ${method} request to ${pathname}`);
      return NextResponse.json(
        { 
          error: 'Demo mode is enabled. Write operations are not allowed.',
          message: 'This is a read-only demo environment. POST, PUT, DELETE, and PATCH requests are blocked.',
          allowedMethods: ['GET', 'HEAD', 'OPTIONS']
        },
        { status: 403 }
      );
    }
  }
  
  // Log page views for relevant routes
  if (shouldLogRoute(pathname)) {
    // Don't await this to avoid slowing down the request
    logPageView(request, pathname);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all API routes
    '/api/:path*',
    // Match all pages
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};