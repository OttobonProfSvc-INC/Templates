import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET(request: NextRequest) {
  try {
    const data = await callInternalApi('/api/workspace');
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
