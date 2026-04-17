#!/usr/bin/env bash
# NOVA — Full deployment script
# Usage: bash scripts/deploy.sh

set -e

SUPABASE_PROJECT="vzzzqsmqqaoilkmskadl"

echo ""
echo "██╗   ██╗ ██████╗ ██╗   ██╗ █████╗ "
echo "████╗ ██║██╔═══██╗██║   ██║██╔══██╗"
echo "██╔██╗██║██║   ██║██║   ██║███████║"
echo "██║╚████║██║   ██║╚██╗ ██╔╝██╔══██║"
echo "██║ ╚███║╚██████╔╝ ╚████╔╝ ██║  ██║"
echo "╚═╝  ╚══╝ ╚═════╝   ╚═══╝  ╚═╝  ╚═╝"
echo "Network Output & Voice Automator"
echo ""

# ── 1. Check Supabase CLI ────────────────────────────────────────────────────
if ! command -v supabase &> /dev/null; then
  echo "❌ supabase CLI not found. Install: https://supabase.com/docs/guides/cli"
  exit 1
fi

# ── 2. Link project ──────────────────────────────────────────────────────────
echo "🔗 Linking Supabase project..."
supabase link --project-ref "$SUPABASE_PROJECT"

# ── 3. Apply migrations ──────────────────────────────────────────────────────
echo "🗄️  Applying database migrations..."
supabase db push

# ── 4. Seed shows ────────────────────────────────────────────────────────────
echo "🌱 Seeding show configurations..."
supabase db execute --file scripts/seed_shows.sql

# ── 5. Deploy Edge Functions ─────────────────────────────────────────────────
echo "⚡ Deploying ai-show-producer..."
supabase functions deploy ai-show-producer

echo "📅 Deploying nova-scheduler..."
supabase functions deploy nova-scheduler

# ── 6. Secrets reminder ──────────────────────────────────────────────────────
echo ""
echo "✅ Functions deployed."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🔑 Set these secrets if not already done:"
echo ""
echo "  supabase secrets set ELEVENLABS_API_KEY=your_key"
echo "  supabase secrets set HEYGEN_API_KEY=your_key"
echo "  supabase secrets set SOCIALBLU_API_KEY=your_key"
echo ""
echo "  (SLACK_BOT_TOKEN + SUPABASE_SERVICE_ROLE_KEY"
echo "   are already set on your project)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── 7. Frontend ───────────────────────────────────────────────────────────────
echo "🎨 Building frontend..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "🎙️  NOVA is ready. Deploy /frontend to Vercel."
echo ""
echo "    vercel --prod"
echo ""
echo "Then open Settings in the dashboard to add"
echo "ElevenLabs Voice IDs and HeyGen Avatar IDs."
echo ""
