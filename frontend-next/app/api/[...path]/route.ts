/**
 * Catch-all API proxy route.
 * Forwards every /api/* request from the browser to the Express backend.
 * More reliable than next.config.ts rewrites for POST/PUT/DELETE bodies.
 */
import { type NextRequest, NextResponse } from 'next/server';

const BACKEND = (process.env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');

async function proxy(req: NextRequest, path: string): Promise<NextResponse> {
  const targetUrl = `${BACKEND}/api/${path}`;

  // Forward safe headers only — drop host, connection, etc.
  const forwardHeaders: Record<string, string> = {
    'content-type': req.headers.get('content-type') ?? 'application/json',
  };
  const auth = req.headers.get('authorization');
  if (auth) forwardHeaders['authorization'] = auth;

  let body: string | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await req.text();
  }

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    });

    const responseBody = await upstream.text();
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[API proxy] Failed to reach backend:', targetUrl, err);
    return NextResponse.json(
      { error: 'Backend unreachable. Make sure the server is running on port 3001.' },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path.join('/'));
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path.join('/'));
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path.join('/'));
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path.join('/'));
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxy(req, path.join('/'));
}
