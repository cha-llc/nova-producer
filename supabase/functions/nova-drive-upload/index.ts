// nova-drive-upload v1
// Uploads a file to Google Drive using a Google service account stored in Supabase secrets.
// Falls back to OAuth token passed in Authorization header if service account not configured.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb     = createClient(SB_URL, SB_SVC);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

// Build a Google OAuth2 access token from service account credentials
async function getServiceAccountToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now   = Math.floor(Date.now() / 1000);
  const claim = { iss: sa.client_email, scope: 'https://www.googleapis.com/auth/drive.file', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 };

  // Build JWT header.payload
  const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const payload = btoa(JSON.stringify(claim)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const unsigned = `${header}.${payload}`;

  // Sign with private key
  const pemKey = sa.private_key.replace(/\\n/g, '\n');
  const binaryKey = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const keyBytes  = Uint8Array.from(atob(binaryKey), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8', keyBytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sigBytes  = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(unsigned));
  const sig       = btoa(String.fromCharCode(...new Uint8Array(sigBytes))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const jwt = `${unsigned}.${sig}`;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json() as { access_token: string };
  if (!data.access_token) throw new Error('Service account token exchange failed');
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  let body: { fileName: string; content: string; mimeType?: string; parentId?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { fileName, content, mimeType = 'text/html', parentId } = body;
  if (!fileName || !content) return json({ error: 'fileName and content required' }, 400);

  // Get Google access token — try service account from Vault first, fall back to user OAuth token
  let accessToken = '';
  try {
    const { data: saJson } = await sb.rpc('vault_read_google_sa_key').catch(() => ({ data: null }));
    if (saJson && String(saJson).length > 100) {
      const sa = JSON.parse(String(saJson));
      accessToken = await getServiceAccountToken(sa);
    }
  } catch { /* no service account — fall through */ }

  // Fall back: use the Authorization header token (user's Google OAuth session)
  if (!accessToken) {
    const authHeader = req.headers.get('Authorization') || '';
    // This is the Supabase JWT — we need to look up the Google token from the session
    // For now, return a clear error so we know which path to fix
    return json({
      error: 'Google service account not configured. Add GOOGLE_SA_KEY to Supabase Vault as vault_read_google_sa_key.',
      hint:  'Alternatively, the Drive MCP can be used directly from the frontend.',
      fallback: true,
    }, 503);
  }

  // Upload file using multipart upload
  const boundary = '----BookEditorBoundary';
  const metadata = JSON.stringify({ name: fileName, ...(parentId ? { parents: [parentId] } : {}) });
  const contentBytes = new TextEncoder().encode(content);

  const multipart = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];

  const part1 = new TextEncoder().encode(multipart[0]);
  const part2 = new TextEncoder().encode(multipart[1]);
  const part3 = new TextEncoder().encode(`\r\n--${boundary}--`);

  const combined = new Uint8Array(part1.length + part2.length + contentBytes.length + part3.length);
  combined.set(part1, 0);
  combined.set(part2, part1.length);
  combined.set(contentBytes, part1.length + part2.length);
  combined.set(part3, part1.length + part2.length + contentBytes.length);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  const result = await uploadRes.json();
  if (!uploadRes.ok) return json({ error: result?.error?.message || 'Drive upload failed', details: result }, uploadRes.status);
  return json(result);
});
