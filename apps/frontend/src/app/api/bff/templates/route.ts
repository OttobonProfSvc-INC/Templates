import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const qs = searchParams.toString();
  const path = qs ? `/api/templates?${qs}` : '/api/templates';

  try {
    const data = await callInternalApi(path);
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
