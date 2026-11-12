import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const data = await callInternalApi(
      `/api/customizations/${encodeURIComponent(id)}/duplicate`,
      {
        method: 'POST',
      }
    );
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleBffError(error);
  }
}
