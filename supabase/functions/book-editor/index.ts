/**
 * book-editor v1
 * Central orchestrator for the C.H.A. LLC Book Editor
 * All keys read from Supabase Vault / env — none in frontend
 *
 * Actions:
 *   claude        — proxies Anthropic API calls (key from vault)
 *   cover         — fal.ai image generation (key from vault)
 *   analyze       — pre-rewrite chapter analysis (issues + targeted fixes)
 *   rewrite       — rewrite one chapter section with full context
 *   extract_bible — extract Book Bible from manuscript
 *   marketing     — full KDP marketing package
 *   score         — score a chapter excerpt
 *   complete      — book completion: save to DB, HubSpot deal, Slack, Drive
 *   consistency   — find character/plot inconsistencies
 *   tool          — content tools (prologue, epilogue, A+, sensitivity, etc.)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── Env ────────────────────────────────────────────────────────────────────────
const SB_URL      = Deno.env.get('SUPABASE_URL')!
const SB_SVC      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SLACK_TOKEN = Deno.env.get('SLACK_BOT_TOKEN') || ''
const HUBSPOT_TOKEN = Deno.env.get('HUBSPOT_TOKEN') || ''
const sb = createClient(SB_URL, SB_SVC)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Vault readers ──────────────────────────────────────────────────────────────
async function vaultRead(fn: string): Promise<string> {
  const { data, error } = await sb.rpc(fn)
  if (error || !data) throw new Error(`Vault read failed: ${fn}`)
  return String(data).trim()
}

// ── Anthropic call ─────────────────────────────────────────────────────────────
async function callClaude(
  messages: { role: string; content: string }[],
  maxTokens = 4000,
  system = ''
): Promise<string> {
  const apiKey = await vaultRead('vault_read_anthropic_key')
  const body: Record<string, unknown> = {
    model: 'claude-sonnet-4-5',
    max_tokens: maxTokens,
    messages,
  }
  if (system) body.system = system

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'content-type':      'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`)
  }
  const d = await res.json()
  return (d.content?.find((b: { type: string }) => b.type === 'text')?.text || '').trim()
}

// ── fal.ai call ────────────────────────────────────────────────────────────────
async function callFal(model: string, prompt: string, imageSize = 'portrait_4_3'): Promise<string[]> {
  const falKey = await vaultRead('vault_read_fal_key')
  const useFalRun = !model.includes('flux/dev') && !model.includes('gpt-image')

  if (useFalRun) {
    const r = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: imageSize, num_images: 1 }),
    })
    const d = await r.json()
    return (d.images || []).map((i: { url: string }) => i.url)
  }

  // Queue for slower models
  const qr = await fetch(`https://queue.fal.run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: imageSize, num_images: 1 }),
  })
  const q = await qr.json()
  const rid = q.request_id
  if (!rid) throw new Error('fal.ai queue submit failed')

  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const sr = await fetch(`https://queue.fal.run/${model}/requests/${rid}`, {
      headers: { Authorization: `Key ${falKey}` }
    })
    const s = await sr.json()
    if (s.status === 'COMPLETED') return (s.output?.images || s.images || []).map((i: { url: string }) => i.url)
    if (s.status === 'FAILED') throw new Error('fal.ai generation failed')
  }
  throw new Error('fal.ai timeout')
}

// ── Slack notification ─────────────────────────────────────────────────────────
async function slackPost(channel: string, text: string): Promise<void> {
  if (!SLACK_TOKEN) return
  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SLACK_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel, text }),
  })
}

// ── HubSpot helpers ────────────────────────────────────────────────────────────
async function hubspotRequest(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = HUBSPOT_TOKEN
  if (!token) return null
  const r = await fetch(`https://api.hubapi.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!r.ok) return null
  return r.json()
}

async function createHubSpotDeal(title: string, author: string, wordCount: number, score: number): Promise<string | null> {
  try {
    const deal = await hubspotRequest('POST', '/crm/v3/objects/deals', {
      properties: {
        dealname:    `📚 Book: ${title}`,
        dealstage:   'closedwon',
        amount:      '0',
        closedate:   new Date().toISOString().split('T')[0],
        description: `Author: ${author} | ${wordCount.toLocaleString()} words | Avg score: ${score}/10`,
        pipeline:    'default',
      },
    }) as { id?: string } | null
    if (deal?.id) {
      // Add note with full stats
      await hubspotRequest('POST', '/crm/v3/objects/notes', {
        properties: {
          hs_note_body:      `Book Editor completed: "${title}" by ${author}\nWords: ${wordCount.toLocaleString()}\nAvg KDP Score: ${score}/10\nCompleted: ${new Date().toLocaleString()}`,
          hs_timestamp:      Date.now().toString(),
          hs_attachment_ids: '',
        },
        associations: [{ to: { id: deal.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }] }],
      })
    }
    return deal?.id || null
  } catch { return null }
}

// ── Google Drive save ──────────────────────────────────────────────────────────
async function saveToDrive(title: string, author: string, html: string): Promise<string> {
  const res = await fetch(`${SB_URL}/functions/v1/nova-drive-upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` },
    body: JSON.stringify({
      fileName: `${title} — ${author} (KDP).html`,
      content:  html,
      mimeType: 'text/html',
      parentId: '1P-UETwfy0b4hZMvsALOsdasPIBQFECxV',
    }),
  })
  const d = await res.json()
  return d.webViewLink || `https://drive.google.com/drive/folders/1P-UETwfy0b4hZMvsALOsdasPIBQFECxV`
}

// ═══════════════════════════════════════════════════════════════════════════════
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const action = body.action as string

  try {
    // ── ACTION: claude ─────────────────────────────────────────────────────────
    if (action === 'claude') {
      const messages = body.messages as { role: string; content: string }[]
      const maxTokens = (body.max_tokens as number) || 4000
      const system    = (body.system as string) || ''
      const text = await callClaude(messages, maxTokens, system)
      return json({ content: [{ type: 'text', text }] })
    }

    // ── ACTION: cover ──────────────────────────────────────────────────────────
    if (action === 'cover') {
      const model     = (body.model as string)      || 'fal-ai/flux/schnell'
      const prompt    = body.prompt as string
      const imageSize = (body.image_size as string) || 'portrait_4_3'
      const urls = await callFal(model, prompt, imageSize)
      return json({ images: urls.map(url => ({ url })) })
    }

    // ── ACTION: analyze ────────────────────────────────────────────────────────
    // Pre-rewrite analysis — finds specific issues to fix before rewriting
    if (action === 'analyze') {
      const chapter  = body.chapter as string
      const title    = body.title   as string
      const number   = body.number  as number
      const genre    = body.genre   as string

      const analysis = await callClaude([{
        role: 'user',
        content: `You are a developmental editor. Analyze Chapter ${number}: "${title}" and identify SPECIFIC issues to fix in the rewrite.
Return ONLY valid JSON — no markdown, no preamble:
{
  "pacing": "fast/slow/good",
  "issues": ["specific issue 1", "specific issue 2"],
  "strengths": ["what works well"],
  "rewrite_instructions": "2-3 specific directives for the rewriter — what to fix, add, expand",
  "opening_hook": "weak/strong",
  "dialogue_quality": "none/weak/strong",
  "showing_vs_telling": "mostly telling/balanced/mostly showing"
}
CHAPTER (first 1500 words):\n${(chapter as string).slice(0, 6000)}`
      }], 800, `You are a professional ${genre} developmental editor. Be specific and actionable.`)

      return json({ analysis })
    }

    // ── ACTION: rewrite ────────────────────────────────────────────────────────
    if (action === 'rewrite') {
      const chapterText     = body.chapter_text      as string
      const chapterTitle    = body.chapter_title     as string
      const chapterNumber   = body.chapter_number    as number
      const genre           = body.genre             as string
      const bibleContext    = (body.bible_context    as string) || ''
      const prevSummary     = (body.prev_summary     as string) || ''
      const voiceContext    = (body.voice_context    as string) || ''
      const analysisInstr   = (body.analysis_instructions as string) || ''
      const sectionNumber   = (body.section_number  as number) || 1
      const sectionTotal    = (body.section_total   as number) || 1

      const system = `You are a world-class ${genre} editor working to Oprah Book Club standard.
Expand, dramatise, add vivid dialogue and sensory detail. Minimum 3× word count if under 1000 words.${voiceContext ? `\n\nAUTHOR VOICE:\n${voiceContext}` : ''}${bibleContext ? `\n\n${bibleContext}` : ''}`

      const userPrompt = [
        prevSummary ? `CONTEXT FROM PREVIOUS CHAPTER: ${prevSummary}` : '',
        analysisInstr ? `EDITOR ANALYSIS — FIX THESE ISSUES:\n${analysisInstr}` : '',
        sectionTotal > 1 ? `This is section ${sectionNumber} of ${sectionTotal}. Output ONLY prose, no heading, continue seamlessly.` : `Output ONLY rewritten prose — no title, no JSON, no commentary.`,
        `CHAPTER ${chapterNumber}: ${chapterTitle}`,
        chapterText,
      ].filter(Boolean).join('\n\n')

      const prose = await callClaude([{ role: 'user', content: userPrompt }], 8000, system)
      return json({ text: prose })
    }

    // ── ACTION: score ──────────────────────────────────────────────────────────
    if (action === 'score') {
      const excerpt = body.excerpt as string
      const genre   = body.genre   as string
      const raw = await callClaude([{
        role: 'user',
        content: `Rate this ${genre} chapter excerpt for KDP/Oprah standard quality.
Return ONLY valid JSON:
{"score":8,"feedback":"2 editorial sentences","new_title":"improved chapter title","alt_titles":["a","b","c"],"summary":"1-sentence chapter summary for passing context to next chapter"}
EXCERPT:\n${excerpt.slice(0, 400)}`
      }], 400)
      return json({ raw })
    }

    // ── ACTION: extract_bible ──────────────────────────────────────────────────
    if (action === 'extract_bible') {
      const manuscript = body.manuscript as string
      const raw = await callClaude([{
        role: 'user',
        content: `You are a professional story analyst and script editor.
Extract a comprehensive Book Bible from this manuscript. Return ONLY valid JSON:
{
  "characters":[{"name":"","role":"protagonist|antagonist|supporting|minor","appearance":"physical description","personality":"traits and mannerisms","arc":"character journey","first_appears":"chapter or scene"}],
  "locations":[{"name":"","description":"","atmosphere":""}],
  "themes":["",""],
  "timeline":"story timeline description",
  "writingStyle":"POV, tense, sentence structure, vocabulary level",
  "plotSummary":"3-sentence plot summary",
  "tone":"overall emotional register",
  "incitingIncident":"what kicks off the story",
  "centralConflict":"the core tension driving the narrative"
}
Max 10 characters, 6 locations. Thorough but concise.
MANUSCRIPT (first 10000 chars):\n${(manuscript as string).slice(0, 10000)}`
      }], 2500, 'You are a professional developmental editor and story analyst.')
      return json({ raw })
    }

    // ── ACTION: marketing ──────────────────────────────────────────────────────
    if (action === 'marketing') {
      const title    = body.title    as string
      const author   = body.author   as string
      const genre    = body.genre    as string
      const synopsis = body.synopsis as string
      const words    = body.words    as number
      const raw = await callClaude([{
        role: 'user',
        content: `You are a professional book marketing strategist with 15 years KDP experience.
Generate a complete marketing package for "${title}" by ${author} (${genre}, ${words.toLocaleString()} words).
Return ONLY valid JSON:
{
  "blurb":"150-word back cover blurb, present tense, hooks immediately, ends with question or tension",
  "tagline":"10-word tagline, punchy, memorable, no punctuation at end",
  "subtitle":"optional subtitle for non-fiction, empty string for fiction",
  "keywords":["kw1","kw2","kw3","kw4","kw5","kw6","kw7"],
  "bisac":["FICTION / Thriller / General","second category"],
  "audience":"2-sentence ideal reader profile with demographics and psychographics",
  "backCover":"Complete back cover — blurb + 1-line author bio + publisher line",
  "aplus":"Amazon A+ content: 1) Editorial Review 150w 2) From the Author 100w 3) About the Author 80w",
  "socialPosts":{
    "tiktok":"viral TikTok hook + caption under 150 chars + 5 hashtags",
    "instagram":"Instagram caption 100-150 chars + 8 hashtags",
    "twitter":"tweet under 280 chars with hook",
    "linkedin":"professional LinkedIn post 200 chars",
    "pinterest":"Pinterest description 100 chars"
  },
  "pressRelease":"50-word press release opener",
  "amazonCategories":["category path 1","category path 2","category path 3"]
}
SYNOPSIS:\n${synopsis}`
      }], 3500, 'You are a bestselling book marketing expert and KDP specialist.')
      return json({ raw })
    }

    // ── ACTION: consistency ────────────────────────────────────────────────────
    if (action === 'consistency') {
      const chapterSummaries = body.chapter_summaries as string
      const bible            = body.bible             as string
      const raw = await callClaude([{
        role: 'user',
        content: `You are a professional continuity editor. Find SPECIFIC inconsistencies.
Look for: character names spelled differently, physical descriptions that change, timeline contradictions, setting errors, plot holes, unresolved threads.
Return ONLY valid JSON array — [] if none found:
[{"type":"character|timeline|setting|plot|dialogue","chapter1":1,"chapter2":3,"issue":"specific description of inconsistency","severity":"minor|major","suggestion":"how to fix"}]
BOOK BIBLE:\n${bible}
CHAPTER SUMMARIES:\n${chapterSummaries}`
      }], 2000)
      return json({ raw })
    }

    // ── ACTION: tool ───────────────────────────────────────────────────────────
    if (action === 'tool') {
      const tool     = body.tool     as string
      const synopsis = body.synopsis as string
      const title    = body.title    as string
      const author   = body.author   as string
      const genre    = body.genre    as string
      const extra    = (body.extra   as string) || ''

      const prompts: Record<string, string> = {
        prologue:    `World-class ${genre} editor. Write a compelling PROLOGUE for "${title}" by ${author}. Hook reader, establish tone, 400–600 words. Plain prose only.\nBased on:\n${synopsis}`,
        epilogue:    `World-class ${genre} editor. Write a satisfying EPILOGUE for "${title}" by ${author}. Closure, emotional resolution, 300–500 words. Plain prose only.\nFinal chapter context:\n${extra}`,
        aplus:       `Amazon A+ content specialist. Write A+ content for "${title}" by ${author} (${genre}):\n1. EDITORIAL REVIEW (150w, third-person)\n2. FROM THE AUTHOR (100w, first-person as ${author})\n3. ABOUT THE AUTHOR (80w)\nBased on:\n${synopsis}`,
        sensitivity: `Professional sensitivity reader. Review these excerpts. Flag: stereotypes, gender dynamics, ableism, trauma portrayal, cultural misrepresentation.\nReturn ONLY valid JSON: [{"chapter":1,"passage":"text","concern":"issue","severity":"low|medium|high","suggestion":"revision"}] or [].\nEXCERPTS:\n${synopsis}`,
        audiobook:   `Audiobook script formatter. Add: [PAUSE] [SLOW] [FAST] [BREATH] [VOICE: Character] for dialogue. Format for professional narration.\n${extra}`,
        print_spec:  `KDP Print Interior Spec for "${title}" by ${author}.\n${extra}`,
        gumroad:     `Complete Gumroad listing for "${title}" by ${author} (${genre}).\nHEADLINE · SUBHEADLINE · DESCRIPTION (200w) · WHO IT'S FOR · WHAT YOU GET · PRICE\nBased on:\n${synopsis}`,
        bookclub:    `Book club discussion guide for "${title}" by ${author} (${genre}).\n1. ABOUT (100w) 2. THEMES (3-4) 3. QUESTIONS (10) 4. CHARACTER PROFILES 5. AUTHOR NOTE 6. READING LIST\nBased on:\n${synopsis}`,
        serial:      `Split "${title}" into 3–5 serial episodes. Return ONLY valid JSON:\n[{"part":1,"title":"","chapters":[1,2],"endHook":"cliffhanger","teaser":"marketing line"}]\nCHAPTERS:\n${extra}`,
      }
      if (!prompts[tool]) return json({ error: `Unknown tool: ${tool}` }, 400)
      const text = await callClaude([{ role: 'user', content: prompts[tool] }], 3000)
      return json({ text })
    }

    // ── ACTION: complete ───────────────────────────────────────────────────────
    // Full book completion: DB save, HubSpot, Slack, Drive
    if (action === 'complete') {
      const title      = body.title      as string
      const author     = body.author     as string
      const genre      = body.genre      as string
      const wordCount  = body.word_count as number
      const avgScore   = body.avg_score  as number
      const chapters   = body.chapters
      const bible      = body.bible
      const marketing  = body.marketing
      const covers     = body.covers
      const htmlContent = body.html_content as string

      // 1. Save to Supabase book_projects
      const { data: book, error: dbError } = await sb
        .from('book_projects')
        .upsert({
          title, author, genre,
          word_count:    wordCount,
          chapter_count: (chapters as unknown[])?.length || 0,
          avg_score:     avgScore,
          chapters,
          bible,
          marketing,
          covers,
          completed_at:  new Date().toISOString(),
        }, { onConflict: 'title' })
        .select('id')
        .single()

      if (dbError) console.error('DB save error:', dbError)

      // 2. Save to Google Drive
      let driveUrl = ''
      if (htmlContent) {
        try { driveUrl = await saveToDrive(title, author, htmlContent) } catch { /* */ }
      }

      // 3. Update Drive URL in DB
      if (book?.id && driveUrl) {
        await sb.from('book_projects').update({ drive_url: driveUrl }).eq('id', book.id)
      }

      // 4. Create HubSpot deal
      let hubspotDealId: string | null = null
      if (HUBSPOT_TOKEN) {
        hubspotDealId = await createHubSpotDeal(title, author, wordCount, avgScore)
        if (hubspotDealId && book?.id) {
          await sb.from('book_projects').update({ hubspot_deal_id: hubspotDealId }).eq('id', book.id)
        }
      }

      // 5. Slack notification
      const slackMsg = [
        `📚 *Book Complete: "${title}"*`,
        `Author: ${author} | Genre: ${genre}`,
        `${wordCount.toLocaleString()} words | Score: ${avgScore}/10`,
        driveUrl ? `Drive: ${driveUrl}` : '',
        hubspotDealId ? `HubSpot Deal: ${hubspotDealId}` : '',
        `Saved to book_projects table${book?.id ? ` (${book.id})` : ''}`,
      ].filter(Boolean).join('\n')

      await slackPost('C0AT3NDG5BJ', slackMsg)

      return json({
        success: true,
        book_id:         book?.id || null,
        drive_url:       driveUrl,
        hubspot_deal_id: hubspotDealId,
      })
    }

    return json({ error: `Unknown action: ${action}` }, 400)

  } catch (e) {
    console.error('book-editor error:', e)
    return json({ error: String(e) }, 500)
  }
})
