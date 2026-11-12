import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

interface RouteContext {
  params: Promise<{ id: string; assetId: string }>;
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id, assetId } = await context.params;

  try {
    const data = await callInternalApi(
      `/api/campaigns/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
      {
        method: 'DELETE',
      }
    );
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
