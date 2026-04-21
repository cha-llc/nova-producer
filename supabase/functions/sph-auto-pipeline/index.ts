// sph-auto-pipeline v1
// Full automated pipeline: approve → HeyGen → social content → Socialblu schedule
// Actions: start | continue
// start  → called by sph-pipeline on approve: queues first HeyGen render
// continue → called by nova-poll on video complete: generates social content, schedules, triggers next

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL  = Deno.env.get('SUPABASE_URL')!;
const SB_SVC  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK   = Deno.env.get('SLACK_BOT_TOKEN')!;
const sb      = createClient(SB_URL, SB_SVC);

// Optimal UTC post times per memory: 01:00, 05:00, 13:00
const OPTIMAL_HOURS = [1, 5, 13];
// All platforms (TikTok, IG, YouTube, Pinterest, Reddit, Twitter, LinkedIn)
const ALL_PLATFORMS = [165296, 165297, 165298, 177489, 177779, 177890, 177891];
const NOVA_CH  = 'C0ATS0LJ1BL';
const SALES_CH = 'C0ASCQV5RNY';
const ESC_CH   = 'C0AT3NDG5BJ';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};
const j = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

async function slack(ch: string, txt: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: ch, text: txt }),
  }).catch(() => {});
}

async function getAnthropicKey(): Promise<string> {
  try {
    const { data } = await sb.rpc('vault_read_anthropic_key');
    if (data && String(data).length > 30) return String(data).trim();
  } catch {}
  const k = Deno.env.get('ANTHROPIC_API_KEY')?.trim();
  if (k && k.length > 30) return k;
  throw new Error('ANTHROPIC_API_KEY not configured');
}

// Calculate optimal schedule datetime for a given week part (0=Sun...6=Sat)
function getScheduleTime(weekStartDate: string, seriesPart: number): string {
  const base = new Date(weekStartDate + 'T00:00:00.000Z');
  base.setUTCDate(base.getUTCDate() + seriesPart);
  const hour = OPTIMAL_HOURS[seriesPart % OPTIMAL_HOURS.length];
  base.setUTCHours(hour, 0, 0, 0);
  // If the scheduled time is in the past, add 7 days
  if (base.getTime() < Date.now()) base.setUTCDate(base.getUTCDate() + 7);
  return base.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
}

// Generate social content for an episode using Claude
async function generateSocialContent(
  scriptText: string,
  partTitle: string,
  seriesTopic: string,
  showName: string,
  anthropicKey: string
): Promise<Record<string, unknown>> {
  const prompt = `You are writing social media content for CJ H. Adisa — Sunday Power Hour.
Slogan: "Sip Slow. Love Loud. Live Free."
Brand: faith-rooted, discipline-based, warm + direct.

EPISODE: "${partTitle}"
SERIES: "${seriesTopic}"
SHOW: Sunday Power Hour

Script preview (first 800 chars):
${scriptText.slice(0, 800)}

Generate social content as a JSON object with exactly these keys:
{
  "episode_title": "Short punchy 5-7 word title",
  "hook": "1-2 line scroll-stopping hook under 100 chars",
  "caption": "2-3 line Instagram caption with core insight, warm tone",
  "cta": "Direct product CTA — mention BrandPulse ($47), Clarity Engine ($37), or Freedom Era Audit ($150)",
  "hashtags": ["#howtobedisciplined", "#sundaypowerhour", "#cjhadisa"],
  "tiktok_copy": "150-word TikTok caption — punchy, short sentences, energy",
  "instagram_copy": "200-word IG caption — hook, value, CTA, 3-5 emojis, hashtags at end",
  "youtube_description": "150-word YouTube description — SEO keywords, what they'll learn, CTA",
  "linkedin_copy": "200-word LinkedIn post — professional, insight-focused, no hashtags",
  "twitter_copy": "240-char tweet — sharp, quotable, one key insight",
  "pinterest_copy": "100-word Pinterest description — search-optimized, benefit-focused",
  "reddit_copy": "150-word Reddit post for r/spirituality — conversational, no hard sell",
  "thumbnail_prompt": "Cinematic thumbnail description for AI image generation",
  "seo_keywords": ["keyword1", "keyword2", "keyword3"]
}

Return ONLY the JSON object. No markdown, no extra text.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-5', max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) throw new Error(`Claude ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const raw = (data.content?.[0]?.text ?? '').trim().replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

// Call ai-show-producer for a script
async function triggerHeyGen(
  scriptId: string, showName: string, avatarId: string,
  heygenVoiceId: string, showColor: string, backgroundUrl: string
): Promise<void> {
  await fetch(`${SB_URL}/functions/v1/ai-show-producer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` },
    body: JSON.stringify({ script_id: scriptId, show_name: showName, avatar_id: avatarId, heygen_voice_id: heygenVoiceId, show_color: showColor, background_url: backgroundUrl }),
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return j({ error: 'POST only' }, 405);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return j({ error: 'Invalid JSON' }, 400); }

  const action = String(body.action ?? '');

  // ─────────────────────────────────────────────
  // ACTION: start — called on SPH approve
  // ─────────────────────────────────────────────
  if (action === 'start') {
    const topicId = String(body.topic_id ?? '');
    if (!topicId) return j({ error: 'topic_id required' }, 400);

    // Load topic
    const { data: topic } = await sb.from('sph_topics').select('*').eq('id', topicId).single();
    if (!topic) return j({ error: 'Topic not found' }, 404);
    const t = topic as Record<string, unknown>;

    // Load show config for sunday_power_hour
    const { data: cfg } = await sb.from('show_configs').select('*').eq('show_name', 'sunday_power_hour').single();
    if (!cfg) return j({ error: 'show_configs missing for sunday_power_hour' }, 500);
    const c = cfg as Record<string, string>;

    // Load all 7 ready scripts for this topic
    const { data: scripts } = await sb.from('show_scripts')
      .select('id,series_part,part_title,series_week_start')
      .eq('sph_topic_id', topicId)
      .eq('status', 'ready')
      .order('series_part', { ascending: true });

    if (!scripts?.length) return j({ error: 'No ready scripts found for this topic' }, 400);

    // Create ai_episodes records for each script (pending, no heygen_video_id yet)
    const episodeRows = (scripts as Record<string, unknown>[]).map(s => ({
      script_id: s.id,
      show_name: 'sunday_power_hour',
      episode_title: s.part_title || `SPH W${t.week_number} Part ${s.series_part}`,
      heygen_title: String(s.part_title || ''),
      heygen_video_id: '',
      status: 'pending',
      source: 'sph_auto',
    }));

    // Upsert — if already exists (from a previous attempt) skip
    for (const row of episodeRows) {
      const { data: exists } = await sb.from('ai_episodes').select('id').eq('script_id', String(row.script_id)).limit(1);
      if (!exists?.length) {
        await sb.from('ai_episodes').insert(row);
      }
    }

    // Trigger HeyGen for the FIRST script (series_part = 0)
    const firstScript = (scripts as Record<string, unknown>[])[0];
    await triggerHeyGen(
      String(firstScript.id), 'sunday_power_hour',
      c.avatar_id, c.heygen_voice_id, c.color, c.background_url
    );

    await slack(NOVA_CH,
      `🚀 *SPH Auto-Pipeline STARTED* | Week ${t.week_number}: "${t.topic}"\n` +
      `🎬 ${scripts.length} videos queued | First render triggered\n` +
      `📅 Posts will auto-schedule at optimal times (01:00, 05:00, 13:00 UTC)`
    );

    return j({ success: true, topic_id: topicId, scripts_queued: scripts.length, message: 'Pipeline started — first HeyGen render triggered' });
  }

  // ─────────────────────────────────────────────
  // ACTION: continue — called by nova-poll on video complete
  // ─────────────────────────────────────────────
  if (action === 'continue') {
    const episodeId = String(body.episode_id ?? '');
    if (!episodeId) return j({ error: 'episode_id required' }, 400);

    // Load episode + script + topic
    const { data: ep } = await sb.from('ai_episodes')
      .select('id,script_id,show_name,storage_url,heygen_video_url,episode_title,heygen_title')
      .eq('id', episodeId).single();
    if (!ep) return j({ error: 'Episode not found' }, 404);
    const episode = ep as Record<string, string>;

    const { data: script } = episode.script_id
      ? await sb.from('show_scripts').select('id,sph_topic_id,series_part,series_week_start,part_title,series_topic,script_text').eq('id', episode.script_id).single()
      : { data: null };

    // Only proceed if this episode belongs to an SPH topic
    const sc = script as Record<string, unknown> | null;
    if (!sc?.sph_topic_id) {
      return j({ skipped: true, reason: 'Not an SPH episode' });
    }

    const topicId = String(sc.sph_topic_id);
    const seriesPart = Number(sc.series_part ?? 0);
    const weekStartDate = String(sc.series_week_start ?? new Date().toISOString().split('T')[0]);

    // Load topic for context
    const { data: topic } = await sb.from('sph_topics').select('*').eq('id', topicId).single();
    const t = topic as Record<string, unknown>;

    // ── GENERATE SOCIAL CONTENT ──
    let socialContent: Record<string, unknown> = {};
    try {
      const anthropicKey = await getAnthropicKey();
      socialContent = await generateSocialContent(
        String(sc.script_text ?? ''),
        String(sc.part_title ?? episode.episode_title ?? ''),
        String(sc.series_topic ?? ''),
        episode.show_name,
        anthropicKey
      );
    } catch (e) {
      await slack(ESC_CH, `⚠️ *SPH Auto-Pipeline* | Social content gen failed for episode ${episodeId}\n${String(e).slice(0, 200)}`);
      // Continue without social content
    }

    // ── INSERT nova_social_content ──
    let socialContentId: string | null = null;
    try {
      const { data: scRow } = await sb.from('nova_social_content').insert({
        episode_id: episodeId,
        script_id: episode.script_id,
        show_name: 'sunday_power_hour',
        episode_title: String(socialContent.episode_title || episode.episode_title || sc.part_title || ''),
        hook: String(socialContent.hook || ''),
        caption: String(socialContent.caption || ''),
        cta: String(socialContent.cta || ''),
        hashtags: Array.isArray(socialContent.hashtags) ? socialContent.hashtags : ['#howtobedisciplined', '#sundaypowerhour', '#cjhadisa'],
        tiktok_copy: String(socialContent.tiktok_copy || ''),
        instagram_copy: String(socialContent.instagram_copy || ''),
        youtube_description: String(socialContent.youtube_description || ''),
        linkedin_copy: String(socialContent.linkedin_copy || ''),
        twitter_copy: String(socialContent.twitter_copy || ''),
        pinterest_copy: String(socialContent.pinterest_copy || ''),
        reddit_copy: String(socialContent.reddit_copy || ''),
        thumbnail_prompt: String(socialContent.thumbnail_prompt || ''),
        seo_keywords: Array.isArray(socialContent.seo_keywords) ? socialContent.seo_keywords : [],
        status: 'complete',
      }).select('id').single();
      if (scRow) {
        socialContentId = (scRow as Record<string, string>).id;
        await sb.from('ai_episodes').update({ social_content_id: socialContentId }).eq('id', episodeId);
      }
    } catch (e) {
      await slack(ESC_CH, `⚠️ *SPH Auto-Pipeline* | nova_social_content insert failed\n${String(e).slice(0, 200)}`);
    }

    // ── SCHEDULE POST ──
    const scheduledAt = getScheduleTime(weekStartDate, seriesPart);
    const episodeTitle = String(socialContent.episode_title || episode.episode_title || sc.part_title || 'SPH Episode');
    const videoUrl = episode.storage_url || episode.heygen_video_url || '';

    try {
      await sb.from('nova_post_queue').insert({
        episode_id: episodeId,
        episode_title: episodeTitle,
        show_name: 'sunday_power_hour',
        account_ids: ALL_PLATFORMS,
        scheduled_at: scheduledAt,
        hook: String(socialContent.hook || ''),
        caption: String(socialContent.caption || ''),
        cta: String(socialContent.cta || ''),
        hashtags: Array.isArray(socialContent.hashtags) ? socialContent.hashtags : [],
        video_url: videoUrl,
        status: 'pending',
      });
    } catch (e) {
      await slack(ESC_CH, `⚠️ *SPH Auto-Pipeline* | Queue insert failed\n${String(e).slice(0, 200)}`);
    }

    await slack(SALES_CH,
      `📅 *SPH Post Scheduled* | Week ${t?.week_number}: "${episodeTitle}"\n` +
      `⏰ ${scheduledAt} UTC | 7 platforms\n` +
      `🎬 ${videoUrl ? '✅ Video ready' : '⚠️ No video URL'}`
    );

    // ── TRIGGER NEXT SCRIPT ──
    // Find next 'pending' ai_episodes for this topic (lowest series_part not yet submitted)
    const { data: nextScripts } = await sb.from('show_scripts')
      .select('id,series_part,part_title')
      .eq('sph_topic_id', topicId)
      .eq('status', 'ready')
      .order('series_part', { ascending: true })
      .limit(1);

    if (nextScripts?.length) {
      const nextScript = (nextScripts as Record<string, unknown>[])[0];
      const { data: cfg } = await sb.from('show_configs').select('*').eq('show_name', 'sunday_power_hour').single();
      const c = cfg as Record<string, string>;

      await triggerHeyGen(
        String(nextScript.id), 'sunday_power_hour',
        c.avatar_id, c.heygen_voice_id, c.color, c.background_url
      );

      await slack(NOVA_CH,
        `⏭️ *SPH Auto-Pipeline* | Week ${t?.week_number} — triggering Part ${nextScript.series_part}: "${nextScript.part_title}"\n` +
        `Part ${seriesPart} complete → Part ${nextScript.series_part} rendering`
      );
    } else {
      // Check if all 7 episodes are complete
      const { data: allEps } = await sb.from('ai_episodes')
        .select('id,status')
        .in('script_id', (await sb.from('show_scripts').select('id').eq('sph_topic_id', topicId)).data?.map((s: Record<string, string>) => s.id) ?? []);

      const allDone = (allEps as Record<string, string>[])?.every(e => e.status === 'complete');
      if (allDone) {
        await sb.from('sph_topics').update({ status: 'complete' }).eq('id', topicId);
        await sb.from('show_scripts').update({ status: 'done' }).eq('sph_topic_id', topicId);
        await slack(NOVA_CH,
          `✅ *SPH Week ${t?.week_number} COMPLETE* | "${t?.topic}"\n` +
          `🎬 All 7 videos produced\n` +
          `📅 All posts scheduled at optimal times\n` +
          `🚀 Auto-pipeline finished — topic marked complete`
        );
        await slack(SALES_CH, `🏆 *SPH Week ${t?.week_number} fully automated* | "${t?.topic}" | 7 videos • 7 posts scheduled`);
      } else {
        await slack(NOVA_CH, `⏳ *SPH Auto-Pipeline* | Week ${t?.week_number} — waiting on remaining renders`);
      }
    }

    return j({ success: true, episode_id: episodeId, social_content_id: socialContentId, scheduled_at: scheduledAt });
  }

  return j({ error: `Unknown action: ${action}` }, 400);
});
