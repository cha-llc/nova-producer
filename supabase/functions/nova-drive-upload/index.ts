// nova-drive-upload v3
// Stores book HTML in Supabase Storage, then uses Anthropic API + Google Drive MCP
// to upload to Drive. The MCP server uses the OAuth token passed via authorization_token.
// Frontend passes its Google OAuth token in X-Google-Token header.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const sb     = createClient(SB_URL, SB_SVC);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Google-Token',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function getAnthropicKey(): Promise<string> {
  try {
    const { data } = await sb.rpc('vault_read_anthropic_key');
    if (data && String(data).length > 30) return String(data).trim();
  } catch { /* fall through */ }
  const k = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (k && k.length > 30) return k;
  throw new Error('ANTHROPIC_API_KEY not configured');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405);

  let body: { fileName: string; content: string; mimeType?: string; parentId?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { fileName, content, mimeType = 'text/html', parentId } = body;
  if (!fileName || !content) return json({ error: 'fileName and content required' }, 400);

  // Google OAuth token — from X-Google-Token header or Vault
  let googleOAuthToken = req.headers.get('X-Google-Token') || '';
  if (!googleOAuthToken) {
    try {
      const { data } = await sb.rpc('vault_read_google_oauth_token').catch(() => ({ data: null }));
      if (data && String(data).length > 20) googleOAuthToken = String(data).trim();
    } catch { /* no vault token */ }
  }

  // If no Google token, upload directly via Drive REST API is not possible.
  // Fall back: save to Supabase Storage and return a storage URL.
  if (!googleOAuthToken) {
    const path   = `book-exports/${Date.now()}-${fileName.replace(/[^a-z0-9._-]/gi, '_')}`;
    const bytes  = new TextEncoder().encode(content);
    const { error } = await sb.storage.from('newsletter-assets').upload(path, bytes, { contentType: mimeType, upsert: true });
    if (error) return json({ error: 'Storage fallback also failed: ' + error.message }, 500);
    const { data: { publicUrl } } = sb.storage.from('newsletter-assets').getPublicUrl(path);
    return json({ id: path, webViewLink: publicUrl, fallback: true, note: 'Saved to Supabase Storage — Google token not available' });
  }

  // Upload directly to Google Drive REST API using the OAuth token
  const boundary    = '----NovaDriveBoundary';
  const metadata    = JSON.stringify({ name: fileName, ...(parentId ? { parents: [parentId] } : {}) });
  const contentBytes = new TextEncoder().encode(content);
  const part1 = new TextEncoder().encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`);
  const part2 = new TextEncoder().encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
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
        'Authorization': `Bearer ${googleOAuthToken}`,
        'Content-Type':  `multipart/related; boundary=${boundary}`,
      },
      body: combined,
    }
  );

  const result = await uploadRes.json();
  if (!uploadRes.ok) {
    // Token expired or invalid — fall back to storage
    const path  = `book-exports/${Date.now()}-${fileName.replace(/[^a-z0-9._-]/gi, '_')}`;
    const bytes = new TextEncoder().encode(content);
    await sb.storage.from('newsletter-assets').upload(path, bytes, { contentType: mimeType, upsert: true });
    const { data: { publicUrl } } = sb.storage.from('newsletter-assets').getPublicUrl(path);
    return json({ id: path, webViewLink: publicUrl, fallback: true, driveError: result?.error?.message });
  }

  return json(result);
});
