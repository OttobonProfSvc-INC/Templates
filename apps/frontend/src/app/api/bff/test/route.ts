import { NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET() {
  try {
    const data = await callInternalApi('/internal/whoami');
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

