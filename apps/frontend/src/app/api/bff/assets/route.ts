import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

/**
 * BFF Endpoint: Master Assets Proxy
 * Securely proxies asset retrieval and master asset creation to backend service
 * using cryptographically signed internal JWT tokens.
 */
export async function GET() {
  try {
    const data = await callInternalApi('/api/assets');
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Call backend /api/assets with ADMIN capability for master template authoring
    const data = await callInternalApi(
      '/api/assets',
      'sbloom-bff',
      'ADMIN',
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleBffError(error);
  }
}
