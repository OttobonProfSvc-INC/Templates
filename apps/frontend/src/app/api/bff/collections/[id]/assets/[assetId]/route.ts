import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const { id, assetId } = await params;

  try {
    const data = await callInternalApi(
      `/api/collections/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
      { method: 'DELETE' }
    );
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
