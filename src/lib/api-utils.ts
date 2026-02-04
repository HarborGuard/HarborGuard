import { NextResponse } from 'next/server';

/**
 * Create a standardized error response for API routes.
 */
export function apiError(error: unknown, fallbackMessage: string, status = 500): NextResponse {
  const message = error instanceof Error ? error.message : fallbackMessage;
  console.error(`API Error: ${fallbackMessage}`, error);
  return NextResponse.json({ error: message }, { status });
}
