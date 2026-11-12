import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET() {
  try {
    const data = await callInternalApi('/api/collections');
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi('/api/collections', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleBffError(error);
  }
}
