import { jwtVerify, createRemoteJWKSet } from 'jose';

const url = `https://cognito-idp.${process.env.NEXT_PUBLIC_AWS_REGION}.amazonaws.com/${process.env.NEXT_PUBLIC_USER_POOL_ID}/.well-known/jwks.json`;
const jwks = createRemoteJWKSet(new URL(url));

export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing token' }), { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  try {
    const { payload } = await jwtVerify(token, jwks);
    return Response.json({ message: 'Authorized', user: payload });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401 });
  }
}


