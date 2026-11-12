import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams.toString();
    const endpoint = searchParams
      ? `/api/calendar/customization-schedules?${searchParams}`
      : '/api/calendar/customization-schedules';
    const data = await callInternalApi(endpoint);
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
