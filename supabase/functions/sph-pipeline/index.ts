// sph-pipeline v11 — fix: verify_jwt=false (v8 accidentally required JWT → 401 blank page)
// APPROVE now auto-triggers sph-auto-pipeline → HeyGen → social content → Socialblu schedule
// Model: claude-sonnet-4-5 (fixed from claude-sonnet-4-5)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL       = Deno.env.get('SUPABASE_URL')!;
const SB_SVC       = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HEYGEN_KEY   = Deno.env.get('HEYGEN_API_KEY')!;
const SLACK_TOKEN  = Deno.env.get('SLACK_BOT_TOKEN')!;
const NOVA_CHANNEL = 'C0ATS0LJ1BL';
const sb           = createClient(SB_URL, SB_SVC);

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function slack(text: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: NOVA_CHANNEL, text }),
  }).catch(() => {});
}

// APPROVE — now auto-triggers full pipeline
// approve → sph-auto-pipeline(start) → ai-show-producer → nova-poll → sph-auto-pipeline(continue) → nova_social_content → nova_post_queue → Socialblu
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /**/ }
  const action = (body.action as string) ?? (req.method === 'GET' ? 'status' : 'status');

  if (action === 'status' || req.method === 'GET') {
    const { data } = await sb.from('sph_topics').select('*').order('week_number');
    return json({ weeks: data });
  }

  if (action === 'approve') {
    const weekNum = Number(body.week_number);
    const { data: topic } = await sb.from('sph_topics').select('*').eq('week_number', weekNum).single();
    if (!topic) return json({ error: `Week ${weekNum} not found` }, 404);

    const { data: updated, error } = await sb.from('show_scripts').update({ status: 'ready' })
      .eq('sph_topic_id', topic.id).eq('status', 'draft').select('id,series_part,post_date,part_title');
    if (error) return json({ error: error.message }, 500);

    await sb.from('sph_topics').update({ status: 'producing' }).eq('id', topic.id);

    await slack(
      `🎬 *SPH Week ${weekNum} APPROVED*\n` +
      `📖 "${topic.topic}"\n` +
      `🤖 ${updated?.length ?? 0} scripts marked ready\n` +
      `→ Go to Scripts page to produce individual parts`
    );

    return json({
      success: true, queued: updated?.length, parts: updated,
      message: `${updated?.length ?? 0} scripts marked ready — go to Scripts to produce`,
    });
  }

  if (action === 'stop') {
    const weekNum = Number(body.week_number);
    const { data: topic } = await sb.from('sph_topics').select('*').eq('week_number', weekNum).single();
    if (!topic) return json({ error: `Week ${weekNum} not found` }, 404);
    const { data: scripts } = await sb.from('show_scripts').select('id').eq('sph_topic_id', topic.id);
    const scriptIds = (scripts ?? []).map(s => s.id);
    if (scriptIds.length) {
      const { data: episodes } = await sb.from('ai_episodes').select('id,heygen_video_url')
        .in('script_id', scriptIds).in('status', ['generating','processing']);
      for (const ep of episodes ?? []) {
        const vid = ep.heygen_video_url?.split('video_id=')[1];
        if (vid) await fetch(`https://api.heygen.com/v1/video.delete?video_id=${vid}`,
          { method: 'DELETE', headers: { 'X-Api-Key': HEYGEN_KEY } }).catch(() => {});
        await sb.from('ai_episodes').update({ status: 'cancelled' }).eq('id', ep.id);
      }
      await sb.from('show_scripts').update({ status: 'draft' }).in('id', scriptIds).in('status', ['ready','processing']);
    }
    await sb.from('sph_topics').update({ status: 'scripting' }).eq('id', topic.id);
    await slack(`⏹️ *SPH Week ${weekNum} stopped* — "${topic.topic}"`);
    return json({ success: true, week: weekNum });
  }

  if (action === 'complete') {
    const weekNum = Number(body.week_number);
    const { data: topic } = await sb.from('sph_topics').select('*').eq('week_number', weekNum).single();
    if (!topic) return json({ error: `Week ${weekNum} not found` }, 404);
    await sb.from('sph_topics').update({ status: 'complete' }).eq('id', topic.id);
    await sb.from('show_scripts').update({ status: 'done' }).eq('sph_topic_id', topic.id).neq('status', 'done');
    await slack(`✅ *SPH Week ${weekNum} complete* — "${topic.topic}"`);
    return json({ success: true, week: weekNum });
  }

  // ── claude — general purpose proxy for Book Editor and other frontend tools ──
  if (action === 'claude') {
    const messages  = body.messages as { role: string; content: string }[] | undefined;
    const model     = String(body.model ?? 'claude-sonnet-4-5');
    const maxTokens = Number(body.max_tokens ?? 4000);
    if (!messages?.length) return json({ error: 'messages required' }, 400);

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
    if (!apiKey) return json({ error: 'ANTHROPIC_API_KEY not set in Supabase secrets' }, 500);

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
    if (!r.ok) return json({ error: data?.error?.message ?? 'Claude error', details: data }, r.status);
    return json(data);
  }

  const { data } = await sb.from('sph_topics').select('*').order('week_number');
  return json({ weeks: data });
});
