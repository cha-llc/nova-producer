// nova-claude v1
// CORS proxy for Anthropic Claude API — used by Book Editor
// Reads ANTHROPIC_API_KEY from Supabase secrets (never exposed to browser)

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  if (!ANTHROPIC_KEY) {
    return json({ error: 'ANTHROPIC_API_KEY not configured in Supabase secrets.' }, 500);
  }

  let body: {
    model?: string;
    max_tokens?: number;
    messages?: unknown[];
    system?: string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { model, max_tokens, messages, system } = body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return json({ error: 'messages array required' }, 400);
  }

  const payload: Record<string, unknown> = {
    model:      model      || 'claude-sonnet-4-5',
    max_tokens: max_tokens || 4000,
    messages,
  };
  if (system) payload.system = system;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key':         ANTHROPIC_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await claudeRes.json();

    if (!claudeRes.ok) {
      return json({ error: data?.error?.message || 'Claude API error', details: data }, claudeRes.status);
    }

    return json(data);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return json({ error: `Claude proxy error: ${msg}` }, 500);
  }
});
