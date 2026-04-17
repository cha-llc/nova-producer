// Supabase Edge Function: ai-show-producer
// NOVA — Network Output & Voice Automator
// Triggered by: database trigger on show_scripts.status = 'ready'
//               OR direct POST { script_id, show_name, voice_id, avatar_id }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL      = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ELEVENLABS_KEY    = Deno.env.get("ELEVENLABS_API_KEY")!;
const HEYGEN_KEY        = Deno.env.get("HEYGEN_API_KEY")!;
const SLACK_BOT_TOKEN   = Deno.env.get("SLACK_BOT_TOKEN")!;
const SOCIALBLU_KEY     = Deno.env.get("SOCIALBLU_API_KEY")!;

// Slack channels (CARD 1B)
const SLACK = {
  deployments: "C0ASNB7QGM7",
  salesLog:    "C0ASCQV5RNY",
  techAlerts:  "C0ARTQ4USMV",
  escalations: "C0AT3NDG5BJ",
};

// Socialblu account IDs (CARD 4)
const SOCIALBLU = { tiktok: 165296, instagram: 165297, youtube: 165298, pinterest: 177489 };

// CHA brand navy for video background
const BG_COLOR = "#1A1A2E";

const sb = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

// ── Utilities ────────────────────────────────────────────────────────────────

async function slack(channel: string, text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {});
}

async function logError(ctx: string, err: unknown) {
  const msg = `🚨 *NOVA ai-show-producer* | ${ctx}\n\`\`\`${String(err)}\`\`\``;
  await slack(SLACK.techAlerts, msg);
  console.error("[NOVA]", ctx, err);
}

async function updateEpisode(scriptId: string, patch: Record<string, unknown>) {
  await sb.from("ai_episodes").update(patch).eq("script_id", scriptId);
}

async function updateScript(id: string, status: string) {
  await sb.from("show_scripts").update({ status }).eq("id", id);
}

// ── Step 1: ElevenLabs voice clone ───────────────────────────────────────────

async function generateAudio(text: string, voiceId: string): Promise<Uint8Array> {
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.3 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ── Step 2: Upload audio to Supabase Storage ─────────────────────────────────

async function uploadAudio(bytes: Uint8Array, show: string, scriptId: string): Promise<string> {
  const path = `ai-shows/${show}/${scriptId}.mp3`;
  const { error } = await sb.storage
    .from("newsletter-assets")
    .upload(path, bytes, { contentType: "audio/mpeg", upsert: true });
  if (error) throw new Error(`Audio upload: ${error.message}`);
  return sb.storage.from("newsletter-assets").getPublicUrl(path).data.publicUrl;
}

// ── Step 3: HeyGen avatar video ───────────────────────────────────────────────

async function submitHeyGen(audioUrl: string, avatarId: string, title: string): Promise<string> {
  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": HEYGEN_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [{
        character: { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
        voice:     { type: "audio", audio_url: audioUrl },
        background:{ type: "color", value: BG_COLOR },
      }],
      dimension: { width: 1080, height: 1920 },
      title,
    }),
  });
  if (!res.ok) throw new Error(`HeyGen submit ${res.status}: ${await res.text()}`);
  const { data } = await res.json();
  return data.video_id as string;
}

async function pollHeyGen(videoId: string): Promise<string> {
  for (let i = 0; i < 72; i++) {          // max 12 min (72 × 10s)
    await new Promise(r => setTimeout(r, 10_000));
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { "X-Api-Key": HEYGEN_KEY },
    });
    const { data } = await res.json();
    if (data?.status === "completed") return data.video_url as string;
    if (data?.status === "failed")    throw new Error(`HeyGen failed: ${data.error}`);
  }
  throw new Error("HeyGen timed out after 12 minutes");
}

// ── Step 4: Store final video in Supabase ────────────────────────────────────

async function storeVideo(videoUrl: string, show: string, scriptId: string): Promise<string> {
  const bytes = new Uint8Array(await (await fetch(videoUrl)).arrayBuffer());
  const path  = `ai-shows/${show}/${scriptId}.mp4`;
  const { error } = await sb.storage
    .from("newsletter-assets")
    .upload(path, bytes, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`Video storage: ${error.message}`);
  return sb.storage.from("newsletter-assets").getPublicUrl(path).data.publicUrl;
}

// ── Step 5: Socialblu auto-post ───────────────────────────────────────────────

async function postSocialblu(storageUrl: string, showName: string, caption: string) {
  const imgPlatforms = [SOCIALBLU.tiktok, SOCIALBLU.instagram, SOCIALBLU.pinterest];
  const scheduledAt  = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // +1hr

  for (const accountId of imgPlatforms) {
    const res = await fetch("https://socialbu.com/api/v2/posts", {
      method: "POST",
      headers: { Authorization: `Bearer ${SOCIALBLU_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [accountId],
        content: caption,
        media_url: storageUrl,
        status: "scheduled",
        scheduled_at: scheduledAt,
      }),
    });
    if (!res.ok) await logError(`Socialblu post failed acct ${accountId}`, await res.text());
  }

  // YouTube with title
  await fetch("https://socialbu.com/api/v2/posts", {
    method: "POST",
    headers: { Authorization: `Bearer ${SOCIALBLU_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      accounts: [SOCIALBLU.youtube],
      title: `${showName.replace(/_/g, " ")} | NOVA Episode`,
      content: caption,
      media_url: storageUrl,
      status: "scheduled",
      scheduled_at: scheduledAt,
    }),
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let scriptId: string, showName: string, voiceId: string, avatarId: string;
  try {
    ({ script_id: scriptId, show_name: showName, voice_id: voiceId, avatar_id: avatarId } = await req.json());
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  if (!scriptId || !showName || !voiceId || !avatarId) {
    return new Response("Missing required fields: script_id, show_name, voice_id, avatar_id", { status: 400 });
  }

  await slack(SLACK.deployments,
    `🎙️ *NOVA starting* | Show: *${showName}* | Script: \`${scriptId.slice(0, 8)}…\``);

  try {
    // Fetch script
    const { data: script, error: sErr } = await sb
      .from("show_scripts").select("script_text,caption").eq("id", scriptId).single();
    if (sErr || !script) throw new Error("Script not found");

    // Step 1 — Voice
    await slack(SLACK.deployments, `🎤 Generating voice via ElevenLabs…`);
    const audioBytes = await generateAudio(script.script_text, voiceId);

    // Step 2 — Audio upload
    const audioUrl = await uploadAudio(audioBytes, showName, scriptId);

    // Step 3 — HeyGen video
    await slack(SLACK.deployments, `🎬 Submitting to HeyGen avatar pipeline…`);
    const videoId      = await submitHeyGen(audioUrl, avatarId, `${showName} — ${scriptId}`);
    const heygenUrl    = await pollHeyGen(videoId);

    // Update episode with audio URL
    await updateEpisode(scriptId, { audio_url: audioUrl, heygen_video_url: heygenUrl });

    // Step 4 — Store video
    await slack(SLACK.deployments, `📦 Storing episode in Supabase Storage…`);
    const storageUrl = await storeVideo(heygenUrl, showName, scriptId);

    // Step 5 — Post
    await slack(SLACK.deployments, `📲 Scheduling posts via Socialblu…`);
    await postSocialblu(storageUrl, showName, script.caption);

    // Finalize
    await updateEpisode(scriptId, { storage_url: storageUrl, status: "complete" });
    await updateScript(scriptId, "done");

    await slack(SLACK.salesLog,
      `✅ *NOVA Episode Published* | ${showName}\n📹 ${storageUrl}`);
    await slack(SLACK.deployments,
      `✅ *NOVA complete* | *${showName}* episode live on TikTok · IG · YouTube · Pinterest`);

    return new Response(JSON.stringify({ success: true, storage_url: storageUrl }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    await logError(`Production failed | script ${scriptId}`, err);
    await updateEpisode(scriptId, { status: "failed", error_msg: String(err) });
    await updateScript(scriptId, "failed");
    await slack(SLACK.escalations,
      `🔴 *NOVA FAILED* | show: ${showName} | script: ${scriptId}\n${String(err)}`);

    return new Response(JSON.stringify({ success: false, error: String(err) }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
