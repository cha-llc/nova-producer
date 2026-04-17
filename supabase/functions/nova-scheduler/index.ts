// Supabase Edge Function: nova-scheduler
// NOVA — Weekly show scheduler
// Cron: set in Supabase dashboard → Edge Functions → nova-scheduler → Cron
//   Sunday 10:00 UTC  → sunday_power_hour
//   Tuesday 10:00 UTC → tea_time_with_cj
//   Wednesday 10:00 UTC → motivation_court
//   Friday 10:00 UTC  → confession_court
//
// This function finds any 'ready' scripts for today's show and fires production.
// If no script is ready, it sends a Slack reminder to #dev-standup.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SVC_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SLACK_BOT_TOKEN  = Deno.env.get("SLACK_BOT_TOKEN")!;

const SLACK_STANDUP    = "C0AS9EDD7U2";   // #dev-standup
const SLACK_DEPLOYS    = "C0ASNB7QGM7";  // #deployments

// Day-of-week → show_name mapping (UTC day, 0 = Sunday)
const DAY_TO_SHOW: Record<number, string> = {
  0: "sunday_power_hour",
  2: "tea_time_with_cj",
  3: "motivation_court",
  5: "confession_court",
};

const sb = createClient(SUPABASE_URL, SUPABASE_SVC_KEY);

async function slack(channel: string, text: string) {
  await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ channel, text }),
  }).catch(() => {});
}

Deno.serve(async (req) => {
  const dayOfWeek = new Date().getUTCDay();
  const showName  = DAY_TO_SHOW[dayOfWeek];

  if (!showName) {
    return new Response(JSON.stringify({ skipped: true, reason: "No show scheduled today" }), {
      status: 200, headers: { "Content-Type": "application/json" },
    });
  }

  // Find the show config
  const { data: show } = await sb
    .from("show_configs")
    .select("*")
    .eq("show_name", showName)
    .single();

  if (!show) {
    await slack(SLACK_STANDUP, `⚠️ *NOVA Scheduler* | No show_config found for \`${showName}\``);
    return new Response(JSON.stringify({ error: "Show config not found" }), { status: 404 });
  }

  // Check show is configured
  if (!show.voice_id || !show.avatar_id) {
    await slack(SLACK_STANDUP,
      `⚠️ *NOVA Scheduler* | *${show.display_name}* not configured.\nGo to Settings and add Voice ID + Avatar ID.`);
    return new Response(JSON.stringify({ error: "Show not configured" }), { status: 200 });
  }

  // Find oldest ready script for this show
  const { data: script } = await sb
    .from("show_scripts")
    .select("id")
    .eq("show_id", show.id)
    .eq("status", "ready")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (!script) {
    await slack(SLACK_STANDUP,
      `📝 *NOVA Scheduler* | *${show.display_name}* has no ready scripts.\nHead to the NOVA dashboard to add one.`);
    return new Response(JSON.stringify({ reminder: true, show: showName }), { status: 200 });
  }

  // Fire the producer
  const producerUrl = SUPABASE_URL + "/functions/v1/ai-show-producer";
  const res = await fetch(producerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SVC_KEY}`,
    },
    body: JSON.stringify({
      script_id:  script.id,
      show_name:  showName,
      voice_id:   show.voice_id,
      avatar_id:  show.avatar_id,
    }),
  });

  const result = await res.json();

  if (result.success) {
    await slack(SLACK_DEPLOYS,
      `📅 *NOVA Scheduler* fired *${show.display_name}* episode production successfully.`);
  } else {
    await slack(SLACK_STANDUP,
      `🚨 *NOVA Scheduler* failed for *${show.display_name}*\n${result.error}`);
  }

  return new Response(JSON.stringify(result), {
    status: res.status, headers: { "Content-Type": "application/json" },
  });
});
