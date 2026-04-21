// nova-drive-upload v2
// Uploads a file to Google Drive via Anthropic API + Google Drive MCP server.
// No service account needed — uses the MCP OAuth credentials already configured.
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

  const anthropicKey = await getAnthropicKey().catch(e => { throw e; });

  // Base64-encode the content for Drive MCP upload
  const b64 = btoa(unescape(encodeURIComponent(content)));

  // Call Anthropic API with Google Drive MCP server attached
  // Claude will invoke the create_file tool and return the result
  const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         anthropicKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-5',
      max_tokens: 1024,
      mcp_servers: [
        {
          type: 'url',
          url:  'https://drivemcp.googleapis.com/mcp/v1',
          name: 'google-drive',
        }
      ],
      messages: [{
        role: 'user',
        content: `Upload a file to Google Drive with these exact parameters and return only the JSON result of the tool call:
- title: "${fileName}"
- content: (base64 encoded, provided below)
- mimeType: "${mimeType}"
- disableConversionToGoogleType: true
${parentId ? `- parentId: "${parentId}"` : ''}

Base64 content:
${b64}

Use the create_file tool. After the tool responds, reply with ONLY a JSON object: {"id":"<file_id>","name":"<file_name>","webViewLink":"<link>"}`
      }],
    }),
  });

  if (!claudeRes.ok) {
    const err = await claudeRes.json().catch(() => ({}));
    return json({ error: 'Claude/MCP call failed', details: err }, claudeRes.status);
  }

  const claudeData = await claudeRes.json();

  // Extract the file result — try tool_result block first, then text block
  const content_blocks = claudeData.content || [];

  // Look for JSON in text response
  for (const block of content_blocks) {
    if (block.type === 'text') {
      try {
        const match = block.text.match(/\{[^{}]*"id"[^{}]*\}/);
        if (match) return json(JSON.parse(match[0]));
      } catch { /* try next */ }
    }
    // Tool result block
    if (block.type === 'tool_result' || block.type === 'tool_use') {
      const inner = block.content || block.input || {};
      if (inner.id || inner.webViewLink) return json(inner);
    }
  }

  // Last resort: return whatever Claude said so frontend can handle it
  return json({ error: 'Drive upload completed but could not parse file ID', raw: claudeData }, 207);
});
