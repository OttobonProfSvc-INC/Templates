import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await callInternalApi(
      `/api/calendar/schedule/${encodeURIComponent(id)}/published-manually`,
      {
        method: 'POST',
      }
    );
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
