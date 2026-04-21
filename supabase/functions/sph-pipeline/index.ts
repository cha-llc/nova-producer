// sph-pipeline v8
// APPROVE now auto-triggers sph-auto-pipeline → HeyGen → social content → Socialblu schedule
// Model: claude-sonnet-4-5 (fixed from claude-sonnet-4-20250514)
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

    // Kick off full auto-pipeline
    try {
      await fetch(`${SB_URL}/functions/v1/sph-auto-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` },
        body: JSON.stringify({ action: 'start', topic_id: topic.id }),
      });
    } catch (e) {
      await slack(`⚠️ *SPH Week ${weekNum}* | Auto-pipeline trigger failed: ${String(e).slice(0, 100)}`);
    }

    await slack(
      `🎬 *SPH Week ${weekNum} APPROVED + AUTO-PIPELINE STARTED*\n` +
      `📖 "${topic.topic}"\n` +
      `🤖 ${updated?.length ?? 0} scripts → HeyGen → social content → auto-scheduling\n` +
      `📅 Posts schedule at 01:00, 05:00, 13:00 UTC automatically`
    );

    return json({
      success: true, queued: updated?.length, parts: updated,
      message: `Auto-pipeline started — ${updated?.length ?? 0} HeyGen renders queued`,
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

  const { data } = await sb.from('sph_topics').select('*').order('week_number');
  return json({ weeks: data });
});
