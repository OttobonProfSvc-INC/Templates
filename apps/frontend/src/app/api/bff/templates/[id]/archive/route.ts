import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const data = await callInternalApi(`/api/templates/${encodeURIComponent(id)}/archive`, {
      method: 'POST',
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
