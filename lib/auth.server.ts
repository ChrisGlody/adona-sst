// lib/auth.server.ts
import { jwtVerify, createRemoteJWKSet } from 'jose';
import { getTokenFromCookie } from './cookies';

const url = `https://cognito-idp.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${process.env.NEXT_PUBLIC_USER_POOL_ID}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(url));

export interface AuthUser {
  sub: string;
  email?: string;
  'cognito:username'?: string;
  [key: string]: any;
}

export async function getAuthUserFromRequest(request: Request): Promise<AuthUser | null> {
  const authHeader = request.headers.get('Authorization');
  let token = authHeader?.replace('Bearer ', '');
  
  // If no token in header, try to get from cookie
  if (!token) {
    const cookieToken = await getTokenFromCookie();
    token = cookieToken || undefined;
  }
  
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwks);
    return payload as AuthUser;
  } catch (err) {
    return null;
  }
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const cookieToken = await getTokenFromCookie();
  const token = cookieToken || undefined;

  
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, jwks);
    return payload as AuthUser;
  } catch (err) {
    return null;
  }
}

export async function requireAuth(): Promise<AuthUser> {
  const user = await getAuthUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}
