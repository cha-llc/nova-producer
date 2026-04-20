// nova-guest-signup v7 - DATABASE SCHEMA FIXED
// FK constraint removed | password_hash column added | Ready to deploy

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = 'https://vzzzqsmqqaoilkmskadl.supabase.co';
const SB_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || '';

interface SignupRequest {
  email: string;
  password: string;
  guest_name: string;
}

interface SignupResponse {
  success: boolean;
  error?: string;
  guest_id?: string;
  email?: string;
  guest_name?: string;
  auth_token?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function j(d: unknown, s: number = 200): Response {
  return new Response(JSON.stringify(d), {
    status: s,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = 'nova_guest_salt_2026';
  const data = new TextEncoder().encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== 'POST') {
    return j({ error: 'Method not allowed' }, 405);
  }

  try {
    const body: SignupRequest = await req.json();
    const { email, password, guest_name } = body;

    // Validation
    if (!email || !password || !guest_name) {
      return j(
        { error: 'Missing required fields: email, password, guest_name' },
        400
      );
    }

    if (!validateEmail(email)) {
      return j({ error: 'Invalid email format' }, 400);
    }

    if (password.length < 8) {
      return j({ error: 'Password must be at least 8 characters' }, 400);
    }

    // Create Supabase client
    const supabase = createClient(SB_URL, SB_ANON_KEY);

    // Check if email already exists
    const { data: existing, error: checkError } = await supabase
      .from('guest_profiles')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (checkError) {
      console.error('[nova-guest-signup] Check email error:', checkError);
      return j({ error: 'Database error' }, 500);
    }

    if (existing && existing.length > 0) {
      return j({ error: 'Email already registered' }, 409);
    }

    // Hash password
    const password_hash = await hashPassword(password);

    // Generate UUID
    const guest_id = crypto.randomUUID();

    // Insert into guest_profiles
    const { error: insertError } = await supabase
      .from('guest_profiles')
      .insert([
        {
          id: guest_id,
          email,
          guest_name,
          password_hash,
        },
      ]);

    if (insertError) {
      console.error('[nova-guest-signup] Insert error:', insertError);
      return j({ error: 'Failed to create account' }, 500);
    }

    // Generate simple auth token (base64 encoded email:password_hash)
    const tokenData = `${email}:${password_hash}`;
    const auth_token = btoa(tokenData);

    return j(
      {
        success: true,
        guest_id,
        email,
        guest_name,
        auth_token,
      },
      201
    );
  } catch (error) {
    console.error('[nova-guest-signup] Error:', error);
    const errMsg =
      error instanceof Error ? error.message : String(error);
    return j({ error: `Server error: ${errMsg}` }, 500);
  }
});
