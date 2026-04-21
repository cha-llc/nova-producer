// nova-queue-processor v6
// Fix: vault_read_anthropic_key RPC for BookEditor (key in Vault, not env)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK   = Deno.env.get('SLACK_BOT_TOKEN')!;
const sb      = createClient(SB_URL, SB_SVC);

async function getAnthropicKey(): Promise<string> {
  try {
    const { data } = await sb.rpc('vault_read_anthropic_key');
    if (data && String(data).length > 30 && !String(data).includes('PLACEHOLDER')) return String(data).trim();
  } catch {}
  const k = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (k && k.length > 30) return k;
  throw new Error('ANTHROPIC_API_KEY not in Vault or env');
}

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function slackPost(channel: string, text: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {});
}

async function notifySuccess(post: Record<string, unknown>) {
  try {
    await fetch(`${SB_URL}/functions/v1/nova-post-success-notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` },
      body: JSON.stringify(post),
    });
  } catch (e) {
    console.error('Failed to notify success:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  // ── action:'claude' — general-purpose Claude proxy for BookEditor ──
  let body: Record<string, unknown> = {};
  try { body = await req.clone().json(); } catch { /* ignore — queue path uses no body */ }

  if (body.action === 'claude') {
    const messages  = body.messages as { role: string; content: string }[] | undefined;
    const model     = String(body.model ?? 'claude-sonnet-4-5');
    const maxTokens = Number(body.max_tokens ?? 4000);
    if (!messages?.length) return j({ error: 'messages required' }, 400);

    let apiKey: string;
    try { apiKey = await getAnthropicKey(); } catch (e) { return j({ error: String(e) }, 500); }

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, messages }),
    });
    const data = await r.json();
    if (!r.ok) return j({ error: (data as Record<string,Record<string,string>>)?.error?.message ?? 'Claude error', details: data }, r.status);
    return j(data);
  }

  const windowEnd = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const { data: duePosts, error: fetchErr } = await sb
    .from('nova_post_queue')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', windowEnd)
    .order('scheduled_at', { ascending: true })
    .limit(5);

  if (fetchErr) return j({ error: fetchErr.message }, 500);
  if (!duePosts?.length) return j({ processed: 0, message: 'No posts due' });

  const postsText = duePosts.map((p: Record<string, unknown>, i: number) => {
    const acctIds = (p.account_ids as number[]) ?? [];
    const title = String(p.episode_title ?? p.show_name);
    const hook = String(p.hook ?? '');
    const caption = String(p.caption ?? '');
    const cta = String(p.cta ?? '');
    const hashtags = Array.isArray(p.hashtags) ? (p.hashtags as string[]).join(' ') : '';
    const scheduled = String(p.scheduled_at);
    const videoUrl = String(p.video_url ?? '');
    return `\nPost ${i + 1}:\n  ID: ${String(p.id)}\n  Title: ${title}\n  Scheduled: ${scheduled}\n  Platforms: ${acctIds.join(', ')}\n  Hook: ${hook.slice(0, 80)}\n  Caption: ${caption.slice(0, 80)}\n  CTA: ${cta.slice(0, 80)}\n  Hashtags: ${hashtags.slice(0, 80)}\n  Video: ${videoUrl ? 'YES' : 'NO'}`;
  }).join('');

  const prompt = `You are helping process a post queue for social media scheduling. Here are ${duePosts.length} posts that are due to be scheduled NOW using Socialblu MCP:\n${postsText}\n\nFor EACH post:\n1. Use Socialblu:create_post to schedule it to ALL specified platform account_ids\n2. Format: content = hook + caption + cta + hashtags (joined with newlines)\n3. scheduled_at format: "YYYY-MM-DD HH:mm:ss" in UTC\n4. Include media_urls=[video_url] if video exists\n5. post_type="scheduled"\n\nAfter all posts are scheduled, respond with a summary of what was posted.`;

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': CLAUDE,
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
        tools: [{
          name: 'socialblu_create_post',
          description: 'Schedule a post to Socialblu via MCP',
          input_schema: {
            type: 'object',
            properties: {
              account_id: { type: 'number', description: 'Socialblu account ID' },
              content: { type: 'string', description: 'Post content' },
              media_urls: { type: 'array', items: { type: 'string' }, description: 'Optional media URLs' },
              scheduled_at: { type: 'string', description: 'ISO 8601 datetime' },
            },
            required: ['account_id', 'content', 'scheduled_at'],
          },
        }],
      }),
    });

    const claudeData = await claudeRes.json();
    const toolUses = (claudeData.content || []).filter((b: Record<string, unknown>) => b.type === 'tool_use');
    const textContent = (claudeData.content || []).find((b: Record<string, unknown>) => b.type === 'text');

    const postIds = (duePosts as Record<string, unknown>[]).map(p => String(p.id));
    await sb.from('nova_post_queue').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', postIds).catch(() => {});

    for (const post of duePosts as Record<string, unknown>[]) {
      const acctIds = (post.account_ids as number[]) ?? [];
      await notifySuccess({
        id: post.id, episode_title: post.episode_title, show_name: post.show_name,
        account_ids: acctIds, status: 'sent',
        success_count: toolUses.length > 0 ? Math.min(acctIds.length, 7) : 0,
        fail_count: 0, error_msg: '',
      });
    }

    await slackPost('C0ATS0LJ1BL',
      `🤖 *Claude Processing Queue via Socialblu MCP*\n📨 ${duePosts.length} posts detected\n🔗 ${toolUses.length} Socialblu MCP calls planned\n💬 ${textContent?.text ? textContent.text.slice(0, 100) : 'Processing...'}`
    );

    return j({ processed: duePosts.length, claude_tool_calls: toolUses.length, claude_response: textContent?.text || 'Tools executing', status: 'queued_to_claude' });
  } catch (e) {
    const msg = String(e);
    await slackPost('C0AT3NDG5BJ', `🔴 *NOVA Queue Processor Error*\n${msg.slice(0, 300)}`);
    return j({ error: msg }, 500);
  }
});
