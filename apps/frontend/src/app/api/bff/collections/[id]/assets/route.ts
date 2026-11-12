import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi(`/api/collections/${encodeURIComponent(id)}/assets`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
