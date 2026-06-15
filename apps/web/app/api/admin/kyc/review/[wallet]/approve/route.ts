import { NextResponse } from 'next/server';

export async function POST(request: Request, { params }: { params: { wallet: string } }) {
  try {
    const wallet = params.wallet;
    const body = await request.json().catch(() => ({}));
    const adminKey = process.env.ADMIN_API_KEY || '';

    const res = await fetch(`${process.env.API_BASE || ''}/api/onboarding/kyc/review/${encodeURIComponent(wallet)}/approve`, {
      method: 'POST',
      headers: { 'x-admin-api-key': adminKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
