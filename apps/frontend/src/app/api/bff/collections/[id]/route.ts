import { NextRequest, NextResponse } from 'next/server';
import { callInternalApi, handleBffError } from '@/lib/server-api';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const data = await callInternalApi(`/api/collections/${encodeURIComponent(id)}`);
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  try {
    const data = await callInternalApi(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const data = await callInternalApi(`/api/collections/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return NextResponse.json(data);
  } catch (error) {
    return handleBffError(error);
  }
}
