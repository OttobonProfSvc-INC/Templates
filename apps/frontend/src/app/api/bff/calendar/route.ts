import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = searchParams ? `/api/calendar?${searchParams}` : '/api/calendar';
    const data = await callInternalApi(endpoint);
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi('/api/calendar/schedule', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    return handleBffError(error);
  }
}
