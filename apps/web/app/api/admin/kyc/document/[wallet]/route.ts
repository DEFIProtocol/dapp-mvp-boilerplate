import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { wallet: string } }) {
  try {
    const wallet = params.wallet;
    const adminKey = process.env.ADMIN_API_KEY || '';
    const res = await fetch(`${process.env.API_BASE || ''}/api/onboarding/kyc/document/${encodeURIComponent(wallet)}`, {
      method: 'GET',
      headers: { 'x-admin-api-key': adminKey },
    });

    const json = await res.json();
    return NextResponse.json(json, { status: res.status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
