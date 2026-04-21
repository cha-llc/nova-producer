// nova-poll v14
// + SPH Auto-Pipeline hook: on episode complete, if script has sph_topic_id → call sph-auto-pipeline continue
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SLACK  = Deno.env.get('SLACK_BOT_TOKEN')!;
const sb     = createClient(SB_URL, SB_SVC);

const CH = { nova:'C0ATS0LJ1BL', deploy:'C0ASNB7QGM7', sales:'C0ASCQV5RNY', alerts:'C0ARTQ4USMV', esc:'C0AT3NDG5BJ' };
const ALL_PLATFORMS = [165296, 165297, 165298, 177489, 177779, 177890, 177891];

function s(v: unknown): string {
  if (!v) return ''; if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try { return JSON.stringify(v); } catch { return String(v); }
}
async function slackPost(channel: string, text: string) {
  await fetch('https://slack.com/api/chat.postMessage', {
    method:'POST', headers:{Authorization:`Bearer ${SLACK}`,'Content-Type':'application/json'},
    body:JSON.stringify({channel,text}),
  }).catch(()=>{});
}
async function getHeyGenKey(): Promise<string> {
  try { const {data} = await sb.rpc('vault_read_heygen_key'); if (data) return String(data).trim(); } catch {}
  return Deno.env.get('HEYGEN_API_KEY')?.trim() ?? '';
}
async function checkVideoStatus(videoId: string, key: string) {
  const r = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {headers:{'X-Api-Key':key}});
  if (!r.ok) throw new Error(`HeyGen status API returned ${r.status}`);
  const b = await r.json(); const d = b.data ?? {};
  return {
    status: d.status ?? 'pending',
    videoUrl: d.video_url ?? '',
    thumbUrl: d.thumbnail_url ?? d.gif_url ?? '',
    duration: String(d.duration ?? ''),
    title: d.title ?? '',
    isBillingError: s(d.error).includes('INSUFFICIENT_CREDIT') || s(d.error).includes('PAYMENT'),
    rawError: s(d.error),
  };
}
async function storeVideo(videoUrl: string, show: string, id: string): Promise<string> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Download: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  const path = `ai-shows/${show}/${id}.mp4`;
  const {error} = await sb.storage.from('newsletter-assets').upload(path, bytes, {contentType:'video/mp4', upsert:true});
  if (error) throw new Error(`Storage: ${error.message}`);
  return sb.storage.from('newsletter-assets').getPublicUrl(path).data.publicUrl;
}
async function triggerBrain(epId: string, scriptId: string, showName: string): Promise<Record<string,unknown>|null> {
  try {
    const r = await fetch(`${SB_URL}/functions/v1/nova-brain`, {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${SB_SVC}`},
      body:JSON.stringify({episode_id:epId, script_id:scriptId, show_name:showName}),
    });
    const d = await r.json(); return d?.content ?? null;
  } catch { return null; }
}
async function triggerImage(epId: string, showName: string, prompt: string) {
  try {
    await fetch(`${SB_URL}/functions/v1/nova-image`, {
      method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${SB_SVC}`},
      body:JSON.stringify({episode_id:epId, show_name:showName, prompt, asset_type:'thumbnail'}),
    });
  } catch {}
}
async function getSocialContent(epId: string): Promise<Record<string,unknown>|null> {
  const {data} = await sb.from('nova_social_content').select('*').eq('episode_id', epId).maybeSingle();
  return data as Record<string,unknown>|null;
}
async function queuePost(epId: string, title: string, show: string, url: string, sc: Record<string,unknown>|null, at: string): Promise<void> {
  try {
    await sb.from('nova_post_queue').insert({
      episode_id:epId, episode_title:title, show_name:show,
      account_ids:ALL_PLATFORMS, scheduled_at:at,
      hook:s(sc?.hook), caption:s(sc?.caption), cta:s(sc?.cta),
      hashtags:Array.isArray(sc?.hashtags)?sc!.hashtags:[], video_url:url, status:'pending',
    });
  } catch {}
}

// NEW v14: Call sph-auto-pipeline continue if this episode belongs to an SPH topic
async function triggerSphAutoPipeline(epId: string, scriptId: string): Promise<void> {
  try {
    if (!scriptId) return;
    const { data: script } = await sb.from('show_scripts').select('sph_topic_id').eq('id', scriptId).single();
    if (!(script as Record<string, unknown>)?.sph_topic_id) return; // Not SPH — skip
    await fetch(`${SB_URL}/functions/v1/sph-auto-pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` },
      body: JSON.stringify({ action: 'continue', episode_id: epId }),
    });
  } catch {}
}

async function releaseOneQueuedScript(): Promise<string|null> {
  const {data: processing} = await sb.from('show_scripts').select('id,part_title').eq('status','processing').limit(30);
  if (!processing?.length) return null;
  for (const sc of processing) {
    const {data: activeEp} = await sb.from('ai_episodes').select('id')
      .eq('script_id',sc.id).eq('status','generating').neq('heygen_video_id','').limit(1);
    if (!activeEp?.length) {
      try { await sb.from('show_scripts').update({status:'ready'}).eq('id',sc.id); } catch {}
      return sc.part_title;
    }
  }
  return null;
}

Deno.serve(async () => {
  // Stale scripting cleanup
  try {
    const STALE_SCRIPTING_MS = 600_000;
    const staleTs = new Date(Date.now() - STALE_SCRIPTING_MS).toISOString();
    const {data: stale} = await sb.from('show_scripts').select('id').eq('status','scripting')
      .not('scripting_started_at','is',null).lt('scripting_started_at',staleTs).limit(10);
    if (stale?.length) {
      await sb.from('show_scripts').update({status:'failed'}).in('id',stale.map((r:Record<string,string>)=>r.id));
      await slackPost(CH.alerts,`⚠️ *nova-poll v14* | Reset ${stale.length} stale scripting scripts`);
    }
    const {data: noTs} = await sb.from('show_scripts').select('id').eq('status','scripting').is('scripting_started_at',null).limit(10);
    if (noTs?.length) await sb.from('show_scripts').update({status:'failed'}).in('id',noTs.map((r:Record<string,string>)=>r.id));
  } catch (e) { console.error('[nova-poll v14] stale cleanup:',s(e)); }

  const hgKey = await getHeyGenKey();
  if (!hgKey) {
    await slackPost(CH.alerts,'🔴 *nova-poll* | HeyGen key missing');
    return new Response(JSON.stringify({error:'no key'}),{status:500});
  }

  const {data: episodes} = await sb.from('ai_episodes')
    .select('id,script_id,show_name,heygen_video_id,created_at')
    .eq('status','generating').neq('heygen_video_id','')
    .order('created_at',{ascending:true}).limit(5);

  if (!episodes?.length) {
    const released = await releaseOneQueuedScript();
    return new Response(JSON.stringify({checked:0, message: released ? `Reset processing: "${released}"` : 'No active renders'}),{status:200});
  }

  const results: Record<string,string> = {};
  const completed: string[] = [];

  for (const ep of episodes) {
    const videoId  = ep.heygen_video_id as string;
    const scriptId = ep.script_id as string ?? '';
    const showName = ep.show_name as string;
    const epId     = ep.id as string;

    try {
      const hg = await checkVideoStatus(videoId, hgKey);
      if (hg.status === 'completed') {
        await slackPost(CH.deploy,`📦 *NOVA rendered* | ${showName}`);
        const storageUrl = await storeVideo(hg.videoUrl, showName, scriptId||epId);
        try {
          await sb.from('ai_episodes').update({
            heygen_video_url:hg.videoUrl, heygen_thumbnail_url:hg.thumbUrl,
            heygen_duration:hg.duration, storage_url:storageUrl,
            status:'complete', error_msg:null,
          }).eq('id',epId);
        } catch {}

        // ── v14: SPH Auto-Pipeline hook ──
        // If this script belongs to an SPH topic, delegate everything to sph-auto-pipeline
        const { data: scriptCheck } = scriptId
          ? await sb.from('show_scripts').select('sph_topic_id').eq('id', scriptId).single()
          : { data: null };
        const isSph = !!(scriptCheck as Record<string, unknown> | null)?.sph_topic_id;

        if (isSph) {
          // SPH episode — sph-auto-pipeline handles social content, scheduling, next trigger
          await triggerSphAutoPipeline(epId, scriptId);
          if (scriptId) { try { await sb.from('show_scripts').update({status:'done'}).eq('id',scriptId); } catch {} }
          await slackPost(CH.nova, `✅ *NOVA v14 Complete (SPH)* | ${showName}\n🔄 sph-auto-pipeline triggered for social + schedule`);
          completed.push(videoId); results[videoId] = 'complete_sph';
        } else {
          // Standard non-SPH flow (unchanged from v13)
          const {data: script} = scriptId
            ? await sb.from('show_scripts').select('caption,part_title').eq('id',scriptId).single()
            : {data:null};
          let sc: Record<string,unknown>|null = null;
          let episodeTitle = script?.part_title || hg.title || showName;
          if (scriptId) {
            sc = await triggerBrain(epId, scriptId, showName);
            if (sc?.episode_title) episodeTitle = String(sc.episode_title);
          } else { sc = await getSocialContent(epId); }
          triggerImage(epId, showName, s(sc?.thumbnail_prompt)||`Cinematic ${showName.replace(/_/g,' ')}: ${episodeTitle}`);
          const scheduledAt = new Date(Date.now()+3_600_000).toISOString().replace('T',' ').replace(/\.\d+Z$/,'');
          await queuePost(epId, episodeTitle, showName, storageUrl, sc, scheduledAt);
          if (scriptId) { try { await sb.from('show_scripts').update({status:'done'}).eq('id',scriptId); } catch {} }
          await releaseOneQueuedScript();
          const summary = [`✅ *NOVA v14 Complete* | ${showName}`, `*${episodeTitle}*`, `📹 ${storageUrl}`, `📥 Post queued for all 7 platforms.`].filter(Boolean).join('\n');
          await slackPost(CH.sales, summary);
          await slackPost(CH.nova, summary);
          completed.push(videoId); results[videoId] = 'complete';
        }
      } else if (hg.status === 'failed') {
        const errMsg = hg.isBillingError ? 'HeyGen: Insufficient API credits' : `HeyGen failed: ${hg.rawError.slice(0,200)}`;
        try { await sb.from('ai_episodes').update({status:'failed',error_msg:errMsg}).eq('id',epId); } catch {}
        if (scriptId) {
          const status = hg.isBillingError ? 'ready' : 'failed';
          try { await sb.from('show_scripts').update({status}).eq('id',scriptId); } catch {}
        }
        await slackPost(CH.esc,`🔴 *NOVA failed* | ${showName}\n${errMsg}`);
        results[videoId] = hg.isBillingError ? 'billing_blocked' : 'render_failed';
      } else {
        const ageMs = Date.now()-new Date(ep.created_at as string).getTime();
        if (ageMs > 45*60*1000) {
          try { await sb.from('ai_episodes').update({status:'failed',error_msg:`Timeout 45min: ${hg.status}`}).eq('id',epId); } catch {}
          if (scriptId) { try { await sb.from('show_scripts').update({status:'ready'}).eq('id',scriptId); } catch {} }
          results[videoId] = 'timeout';
        } else { results[videoId] = hg.status; }
      }
    } catch (e) {
      const errMsg = s(e);
      await slackPost(CH.alerts,`⚠️ *nova-poll error* | ${showName}\n${errMsg.slice(0,300)}`);
      results[videoId] = `error: ${errMsg.slice(0,80)}`;
    }
  }
  return new Response(JSON.stringify({checked:episodes.length,completed,results}),{status:200});
});
