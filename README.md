# NOVA — Network Output & Voice Automator

> *Your AI co-host. Built for Tea Time Network.*

NOVA is the AI show producer for C.H.A. LLC's Tea Time Network. It takes a script, clones CJ's voice via ElevenLabs, generates a talking-head avatar video via HeyGen, stores the episode in Supabase, and auto-posts to TikTok, Instagram, YouTube, and Pinterest via Socialblu.

---

## Four Shows Supported

| Show | Frequency |
|---|---|
| Sunday Power Hour | Weekly — Sunday |
| Motivation Court | Weekly — Wednesday |
| Tea Time with CJ | Weekly — Tuesday |
| Confession Court | Weekly — Friday |

---

## Stack

- **Frontend** — React 18 + TypeScript + Vite + Tailwind CSS
- **Backend** — Supabase Edge Functions (Deno)
- **Database** — Supabase (PostgreSQL) — project `vzzzqsmqqaoilkmskadl`
- **Storage** — Supabase Storage (`newsletter-assets/ai-shows/`)
- **Voice** — ElevenLabs API (voice cloning)
- **Avatar Video** — HeyGen API
- **Social** — Socialblu API
- **Alerts** — Slack + cs@cjhadisa.com
- **Deployment** — Vercel (frontend)

---

## Folder Structure

```
nova-producer/
├── frontend/          React dashboard app
├── supabase/
│   ├── functions/     Edge Functions
│   └── migrations/    SQL migrations
└── scripts/           Deploy + seed scripts
```

---

## Setup

### 1. Supabase Secrets

```bash
supabase secrets set ELEVENLABS_API_KEY=your_key
supabase secrets set HEYGEN_API_KEY=your_key
supabase secrets set SOCIALBLU_API_KEY=your_key
# SLACK_BOT_TOKEN and GMAIL_APP_PASSWORD already set
```

### 2. Apply Migrations

```bash
supabase db push
```

### 3. Deploy Edge Functions

```bash
bash scripts/deploy.sh
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

---

## How It Works

1. Open the NOVA dashboard → select a show → write or paste a script
2. Set script status to **Ready** — this fires the Supabase database trigger
3. The `ai-show-producer` Edge Function:
   - Generates audio via ElevenLabs (your cloned voice)
   - Creates talking-head video via HeyGen (your avatar)
   - Stores the `.mp4` in Supabase Storage
   - Posts to TikTok, IG, YouTube, Pinterest via Socialblu
   - Logs the episode and fires Slack alerts
4. View completed episodes in the Episodes tab — with direct links to each platform

---

## Brand

- **Colors** — Navy `#1A1A2E` · Gold `#C9A84C` · Teal `#2A9D8F` · Crimson `#C1121F` · Violet `#9B5DE5`
- **Slogan** — *Sip slow. Love loud. Live free.*
- **Company** — C.H.A. LLC / CJ H. Adisa

---

*NOVA — Network Output & Voice Automator*
