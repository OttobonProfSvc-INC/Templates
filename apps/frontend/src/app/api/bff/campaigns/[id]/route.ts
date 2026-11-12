import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await callInternalApi(`/api/campaigns/${encodeURIComponent(id)}`);
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  try {
    const data = await callInternalApi(`/api/campaigns/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
