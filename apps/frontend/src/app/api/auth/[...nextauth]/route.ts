import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ authenticated: false, message: 'sBLOOM operates without user sessions.' }, { status: 200 });
}

export async function POST() {
  return NextResponse.json({ authenticated: false, message: 'sBLOOM operates without user sessions.' }, { status: 200 });
}
