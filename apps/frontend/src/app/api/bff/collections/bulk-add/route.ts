import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi('/api/collections/bulk-add', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
