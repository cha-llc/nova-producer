// ai-show-producer v34
// NOVA — Network Output & Voice Automator
// HeyGen-only pipeline. No ElevenLabs. Vault-first key loading.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN  = Deno.env.get("SLACK_BOT_TOKEN")!;

const SLACK = {
  nova:        "C0ATS0LJ1BL",
  salesLog:    "C0ASCQV5RNY",
  techAlerts:  "C0ARTQ4USMV",
  escalations: "C0AT3NDG5BJ",
};

const BG_COLOR = "#1A1A2E";
const MAX_HEYGEN_CHARS = 4900;

const sb = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, "Content-Type": "application/json" }
  });
}

async function slack(channel: string, text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {});
}

// Vault-first HeyGen key loading
async function getHeyGenKey(): Promise<string> {
  try {
    const { data, error } = await sb.rpc("vault_read_heygen_key");
    if (!error && data) {
      const k = String(data).trim();
      if (k.length > 10) return k;
    }
  } catch {}
  const envKey = Deno.env.get("HEYGEN_API_KEY")?.trim();
  if (envKey && envKey.length > 10) return envKey;
  throw new Error("HEYGEN_API_KEY not found in vault or env");
}

// Truncate to HeyGen's 4900-char limit at sentence boundary
function truncateScript(text: string): string {
  if (text.length <= MAX_HEYGEN_CHARS) return text;
  const t = text.slice(0, MAX_HEYGEN_CHARS);
  const last = Math.max(t.lastIndexOf('. '), t.lastIndexOf('?\n'), t.lastIndexOf('.\n'));
  return last > 4000 ? t.slice(0, last + 1) : t;
}

async function submitHeyGen(
  scriptText: string, voiceId: string, avatarId: string,
  title: string, bgUrl: string, heygenKey: string
): Promise<string> {
  const text = truncateScript(scriptText);
  const background = bgUrl?.startsWith('http')
    ? { type: "image", url: bgUrl }
    : { type: "color", value: BG_COLOR };

  const res = await fetch("https://api.heygen.com/v2/video/generate", {
    method: "POST",
    headers: { "X-Api-Key": heygenKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      video_inputs: [{
        character:  { type: "avatar", avatar_id: avatarId, avatar_style: "normal" },
        voice:      { type: "text", input_text: text, voice_id: voiceId, speed: 1.0 },
        background,
      }],
      dimension: { width: 1080, height: 1920 },
      title: title.slice(0, 80),
      caption: false,
      test: false,
    }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`HeyGen submit ${res.status}: ${body.slice(0, 400)}`);
  const parsed = JSON.parse(body);
  const videoId = parsed?.data?.video_id;
  if (!videoId) throw new Error(`HeyGen no video_id: ${body.slice(0, 200)}`);
  return videoId as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: Record<string, string>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const {
    script_id: scriptId, show_name: showName,
    heygen_voice_id: voiceId, avatar_id: avatarId,
    background_url: bgUrl = ""
  } = body;

  if (!scriptId || !showName || !voiceId || !avatarId) {
    return json({
      error: "Missing required: script_id, show_name, heygen_voice_id, avatar_id",
      received: { scriptId: !!scriptId, showName: !!showName, voiceId: !!voiceId, avatarId: !!avatarId }
    }, 400);
  }

  await slack(SLACK.nova, `🎙️ *NOVA producing* | ${showName} | \`${scriptId.slice(0, 8)}…\``);

  try {
    const heygenKey = await getHeyGenKey();

    const { data: script, error: sErr } = await sb
      .from("show_scripts")
      .select("script_text,caption,part_title,series_topic")
      .eq("id", scriptId)
      .single();
    if (sErr || !script) throw new Error(`Script not found: ${sErr?.message || "unknown"}`);
    const s = script as Record<string, string>;

    const episodeTitle = s.part_title || s.series_topic || showName;
    const heygenTitle  = `${showName} — ${episodeTitle}`;

    // Upsert episode record — status=generating so nova-poll picks it up
    const { data: existingEp } = await sb
      .from("ai_episodes").select("id").eq("script_id", scriptId).maybeSingle();

    if (existingEp) {
      await sb.from("ai_episodes").update({
        episode_title: episodeTitle, heygen_title: heygenTitle,
        heygen_video_id: "", status: "generating", error_msg: ""
      }).eq("script_id", scriptId);
    } else {
      await sb.from("ai_episodes").insert({
        script_id: scriptId, show_name: showName,
        episode_title: episodeTitle, heygen_title: heygenTitle,
        heygen_video_id: "", status: "generating", source: "nova",
      });
    }

    await slack(SLACK.nova, `🎬 Submitting to HeyGen — ${heygenTitle.slice(0, 60)}`);
    const videoId = await submitHeyGen(s.script_text, voiceId, avatarId, heygenTitle, bgUrl, heygenKey);

    // Set video ID — nova-poll polls every 2 min until completion
    await sb.from("ai_episodes").update({ heygen_video_id: videoId }).eq("script_id", scriptId);
    await sb.from("show_scripts").update({ status: "processing" }).eq("id", scriptId);

    await slack(SLACK.nova,
      `⏳ *HeyGen accepted* | video_id \`${videoId}\`\nnova-poll will detect completion and finalize.`);

    return json({
      success: true, video_id: videoId, script_id: scriptId,
      show: showName, title: heygenTitle, status: "generating",
      message: "HeyGen submitted. nova-poll will complete this episode automatically."
    });

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[nova v34]", errMsg);
    await sb.from("ai_episodes")
      .update({ status: "failed", error_msg: errMsg })
      .eq("script_id", scriptId).catch(() => {});
    await sb.from("show_scripts")
      .update({ status: "ready" })
      .eq("id", scriptId).catch(() => {});
    await slack(SLACK.escalations,
      `🔴 *NOVA ai-show-producer v34 FAILED*\nScript: \`${scriptId}\`\nShow: ${showName}\n\`${errMsg.slice(0, 400)}\``);
    return json({ success: false, error: errMsg }, 500);
  }
});
