import { NextResponse } from 'next/server';
import { isAuthEnabled } from '@/lib/auth.config';

export async function GET() {
  return NextResponse.json({
    authEnabled: isAuthEnabled,
  });
}
