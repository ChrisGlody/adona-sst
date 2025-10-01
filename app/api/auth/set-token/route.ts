import { NextRequest, NextResponse } from 'next/server';
import { setTokenCookie } from '@/lib/cookies';

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    
    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Set the token in a secure HTTP-only cookie
    await setTokenCookie(token);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to set token' }, { status: 500 });
  }
}
