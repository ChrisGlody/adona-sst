import { getAuthUser } from '@/lib/auth.server';

export async function GET(request: Request) {
  const user = await getAuthUser();
  
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  return Response.json({ message: 'Authorized', user });
}


