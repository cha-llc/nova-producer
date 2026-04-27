/**
 * book-editor v5 — Bestseller-grade rewrite engine
 *
 * MAJOR UPGRADES vs v4:
 * - claude-opus-4-7 (most capable model) for rewrite / expand / alternatives / scene_generate / dialogue / describe
 * - claude-sonnet-4-5 (faster) retained for analyze / score / hooks / arc / kdp / brainstorm / extract_bible
 * - Genre-specific craft frameworks (15 genres with distinct beats and style anchors)
 * - 10 craft non-negotiables baked into every rewrite prompt (show-don't-tell, sensory grounding,
 *   dialogue subtext, active POV, concrete specificity, variable rhythm, scene structure,
 *   filler-cutting, strong verbs, earned emotion)
 * - Edit modes (light/deep/rewrite) get distinct directives with concrete actions
 * - Voice context is integrated into system prompt, not appended as label
 * - Analyzer's rewrite_instructions are now PROMINENT in the rewrite prompt (used to be ignored)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sb = createClient(SB_URL, SB_SVC)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ─── Key resolution ───────────────────────────────────────────────────────────
async function fromVault(fn: string): Promise<string | null> {
  try { const { data } = await sb.rpc(fn); if (data && String(data).length > 8) return String(data).trim() } catch { /**/ }
  return null
}
function fromEnv(...n: string[]): string | null {
  for (const k of n) { const v = Deno.env.get(k)?.trim(); if (v && v.length > 4) return v }
  return null
}
async function getKey(vfn: string, ...env: string[]): Promise<string | null> {
  return await fromVault(vfn) || fromEnv(...env)
}
const keys = {
  anthropic:  () => getKey('vault_read_anthropic_key', 'ANTHROPIC_API_KEY'),
  fal:        () => getKey('vault_read_fal_key', 'FAL_KEY', 'FAL_API_KEY', 'fal_api_key'),
  slack:      () => Promise.resolve(fromEnv('SLACK_BOT_TOKEN', 'SLACK_TOKEN')),
  hubspot:    () => Promise.resolve(fromEnv('HUBSPOT_TOKEN', 'HUBSPOT_API_KEY', 'HUBSPOT_PRIVATE_APP_TOKEN')),
  elevenlabs: () => getKey('vault_read_elevenlabs_key', 'ELEVENLABS_API_KEY'),
  heygen:     () => getKey('vault_read_heygen_key', 'HEYGEN_API_KEY'),
  canva_id:   () => getKey('vault_read_canva_id', 'CANVA_CLIENT_ID'),
  pinterest:  () => getKey('vault_read_pinterest_key', 'PINTEREST_API_TOKEN'),
}

// ─── AI helper with model selection ───────────────────────────────────────────
const MODEL_OPUS    = 'claude-opus-4-7'      // creative rewriting — highest quality
const MODEL_SONNET  = 'claude-sonnet-4-5'    // analytical work — fast + cheap

async function ai(
  messages: { role: string; content: string }[],
  max = 4000,
  sys = '',
  model = MODEL_SONNET
): Promise<string> {
  const k = await keys.anthropic()
  if (!k) throw new Error('Anthropic key not found')
  const body: Record<string, unknown> = { model, max_tokens: max, messages }
  if (sys) body.system = sys
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const e = await r.text()
    // Fallback: if Opus is rate-limited or unavailable, retry with Sonnet
    if (model === MODEL_OPUS && (r.status === 429 || r.status === 529 || r.status === 404)) {
      const r2 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': k, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, model: MODEL_SONNET }),
      })
      if (!r2.ok) throw new Error(`Anthropic ${r2.status}: ${(await r2.text()).slice(0, 200)}`)
      const d2 = await r2.json()
      return (d2.content?.find((b: { type: string }) => b.type === 'text')?.text || '').trim()
    }
    throw new Error(`Anthropic ${r.status}: ${e.slice(0, 200)}`)
  }
  const d = await r.json()
  return (d.content?.find((b: { type: string }) => b.type === 'text')?.text || '').trim()
}

// ─── Genre-specific craft frameworks ──────────────────────────────────────────
const GENRE_BEATS: Record<string, { anchors: string; beats: string }> = {
  thriller: {
    anchors: 'Lee Child (terse rhythm, subject-verb cadence), Gillian Flynn (psychological knife-edge), Don Winslow (cinematic pace), Tana French (atmospheric dread)',
    beats: 'Pace = breath. Short paragraphs in action. Plant menace by paragraph 3. Use environmental tension (silence, surveillance, weather as threat). Every chapter ends on cliffhanger, revelation, or unresolved threat. Withhold information ruthlessly.',
  },
  mystery: {
    anchors: 'Tana French (interiority + atmosphere), Louise Penny (community texture), Anthony Horowitz (fair-play clues)',
    beats: 'Plant clues fairly but conceal expertly via misdirection. Detective interiority — what they notice that others miss. Dialogue carries double meaning. Build dread through specific environmental detail. Suspects each have a tell.',
  },
  romance: {
    anchors: 'Emily Henry (witty banter), Beverly Jenkins (historical depth), Casey McQuiston (tension + warmth), Talia Hibbert (interior emotion)',
    beats: 'Tension = oxygen. Every scene moves attraction forward OR sets up obstacle. Sensory awareness of the other (smell, voice, accidental touch, eye contact). Internal contradiction (want + resist). Earn each beat — first touch, first kiss, first vulnerability.',
  },
  literary: {
    anchors: 'Marilynne Robinson (cadence), Toni Morrison (density + image), Colson Whitehead (precision), Hanya Yanagihara (emotional architecture)',
    beats: 'Subtext over plot. Image as meaning. Lyrical specificity. Time as theme. Class/race/identity texture. Earned epiphany — never stated, always shown via image or action.',
  },
  scifi: {
    anchors: 'Ted Chiang (idea + emotion), Becky Chambers (humane futures), N.K. Jemisin (perspective), Kim Stanley Robinson (systems thinking)',
    beats: 'Worldbuilding via implication, not exposition. One core "what if" amplified. Hard rules consistently applied. Character grounds the strange. Show technology through use, not lecture.',
  },
  fantasy: {
    anchors: 'N.K. Jemisin (POV + worldbuilding), Brandon Sanderson (rule-based magic), Ursula K. Le Guin (humanity + myth), Naomi Novik (texture + voice)',
    beats: 'Magic systems have costs. Names matter (sound, etymology). Worldbuilding through character experience, never narrator dump. Mythic resonance. Stakes scale from personal to cosmic.',
  },
  horror: {
    anchors: 'Stephen King (mundane → menace), Shirley Jackson (psychological dread), Carmen Maria Machado (body + image), Paul Tremblay (ambiguity)',
    beats: 'Dread before scare. Build through specific detail of the wrong thing. Sensory grounding — wet, cold, wrong-smelling. Silence between heartbeats. The body remembers what the mind forgets.',
  },
  ya: {
    anchors: 'Angie Thomas (voice + politics), Leigh Bardugo (intricate worlds), Adam Silvera (emotional truth), Sabaa Tahir (stakes)',
    beats: 'First-person voice carries the book. Internal monologue is honest, raw, contradictory. Friend group dynamics matter. Identity is emerging, not fixed. Adults are present but secondary.',
  },
  middlegrade: {
    anchors: 'Kate DiCamillo (emotional clarity), Rick Riordan (humor + heart), Jacqueline Woodson (lyrical childhood), Jason Reynolds (voice)',
    beats: 'Protagonist agency drives every scene. Stakes are personal and concrete. Humor + heart. Adult problems filtered through child perception. Hope is non-negotiable.',
  },
  historical: {
    anchors: 'Hilary Mantel (immersive POV), Kristin Hannah (emotional sweep), Min Jin Lee (generational scope), Colson Whitehead (precise period)',
    beats: 'Period detail through character experience, never tour-guide narration. Idiom must match era. Social rules constrain action. History happens to people who are trying to live their lives.',
  },
  crime: {
    anchors: 'Don Winslow (cinematic), Megan Abbott (psychological), Walter Mosley (voice + place), Attica Locke (justice)',
    beats: 'Procedure must feel real, never feel like procedure. Moral ambiguity. Place as character. Dialogue carries class, region, era. Crime exposes the social fault line.',
  },
  contemporary: {
    anchors: 'Sally Rooney (interiority + dialogue), Brit Bennett (generational), Raven Leilani (visceral specificity), Bryan Washington (place)',
    beats: 'Modern texture (technology, idiom, references) without dating the work. Interior contradiction. Specific concrete details over abstract emotion. Dialogue carries unspoken weight.',
  },
  womensfiction: {
    anchors: 'Liane Moriarty (community texture), Taylor Jenkins Reid (voice-driven), Kristin Hannah (emotional sweep), Celeste Ng (psychological precision)',
    beats: 'Friendship + family dynamics drive plot. Internal life is the story. Specific domestic detail. Time pressure (reunion, wedding, illness). Emotional truth over plot mechanics.',
  },
  memoir: {
    anchors: 'Mary Karr (voice), Tara Westover (image), Roxane Gay (precision), James McBride (rhythm)',
    beats: 'Specific scene over summary. Sensory memory. Adult perspective shaping child memory. Honesty about complicity. Earned reflection — never preach, always show.',
  },
  fiction: {
    anchors: 'Bestseller-grade prose: specific, propulsive, emotionally true',
    beats: 'Strong scene goals, sensory grounding, dialogue subtext, active POV, concrete details, variable rhythm. Each scene moves character or plot forward.',
  },
}

function getGenreFramework(genre: string): { anchors: string; beats: string } {
  return GENRE_BEATS[genre?.toLowerCase()] || GENRE_BEATS.fiction
}

// ─── Edit mode directives ─────────────────────────────────────────────────────
function getEditModeDirective(mode: string, originalWords: number): { directive: string; targetWords: number } {
  if (mode === 'light') return {
    directive: `LIGHT EDIT — preserve structure and length. Surgical fixes only:
• Strengthen every weak verb (replace "was running" with "sprinted")
• Eliminate passive voice unless intentional
• Cut weak adverbs ("very," "really," "suddenly")
• Cut filter words (felt/saw/heard/noticed/realized) — render the experience instead
• Polish dialogue tags ("said" only, no fancy alternatives unless purposeful)
• Sharpen sensory details where flat
• DO NOT add new content, scenes, or restructure
• Output should read 5-10% shorter, not longer`,
    targetWords: Math.round(originalWords * 0.95),
  }
  if (mode === 'deep') return {
    directive: `DEEP EDIT — 1.5× length. Restructure for impact:
• Reorder beats for maximum tension and pacing
• Expand emotional moments with sensory detail + interior monologue
• Add subtext to every line of dialogue (what's unsaid matters more)
• Strengthen scene structure (clear goal → mounting conflict → outcome that changes the situation)
• Sharpen pacing — speed up flat parts (cut), linger on charged moments (expand with sensory + reaction)
• Add 1-2 specific concrete details per paragraph (smells, textures, brand names, body language)
• Open the chapter with a hook in the first sentence
• End the chapter on a beat that compels the reader to continue`,
    targetWords: Math.round(originalWords * 1.5),
  }
  // Full rewrite (default)
  return {
    directive: `FULL REWRITE — bestseller-grade prose. Target 3× length minimum (more if needed for full-grade scene execution):
• Open with a hook so compelling the reader CANNOT put the book down
• Every scene engages 3+ senses (sight, sound, smell, touch, taste, kinesthetic)
• Add deep interior monologue revealing the POV character's wants, fears, contradictions
• Layer every dialogue exchange with subtext, conflict, and specific physical action
• Add specific concrete details — brand names, textures, smells, sounds, body language, weather
• Build scene tension through clear goal-obstacle-stakes structure
• End on an emotional cliffhanger, revelation, or unresolved threat
• Match the prose density of NYT bestsellers in this genre
• If a moment can be expanded with vivid scene-craft, EXPAND IT — never summarize when you can dramatize`,
    targetWords: Math.max(1200, originalWords * 3),
  }
}

// ─── Master craft framework (applied to all rewriting actions) ───────────────
const CRAFT_FRAMEWORK = `CRAFT NON-NEGOTIABLES (every paragraph must honor these):

1. SHOW DON'T TELL — Replace "she felt sad" with the body, action, or sensory detail that triggered or expressed it. Never name the emotion; render its physical reality.

2. SENSORY GROUNDING — Every scene engages 3+ senses. Smell and touch are most underused — use them.

3. ACTIVE POV — Visceral interiority from ONE character per scene. We feel what they feel in their body, not what the narrator reports about them.

4. DIALOGUE SUBTEXT — Characters rarely say what they mean. The truth lives in what's withheld, deflected, or contradicted by body language.

5. SPECIFIC CONCRETE DETAILS — "Her father's gold tooth caught the porch light" beats "her father was elderly." Brand names. Textures. Specific weather. Specific street.

6. VARIABLE RHYTHM — Mix short punchy sentences with longer flowing ones. Pace must match emotion: short for action/fear, longer for reflection/intimacy.

7. SCENE STRUCTURE — Each scene = clear GOAL → escalating CONFLICT → OUTCOME that changes the situation. No scene should leave the story in the same place it started.

8. CUT FILLER — Banish "began to," "started to," "was [verb]ing" if "[verb]ed" works. Cut filter words: felt, saw, heard, noticed, realized, watched, observed, thought.

9. STRONG VERBS — "She crashed into him" beats "she ran fast and bumped him." One precise verb beats verb-plus-adverb every time.

10. EARN EMOTION — Never tell the reader to feel something. Make them feel it through specific, unsentimental images that carry the emotional weight without naming it.`

function buildRewriteSystemPrompt(genre: string, voiceContext: string, mode: string, originalWords: number): { sys: string; targetWords: number } {
  const g = getGenreFramework(genre)
  const m = getEditModeDirective(mode, originalWords)
  const voiceBlock = voiceContext
    ? `\n\nAUTHOR VOICE FINGERPRINT (match exactly):\n${voiceContext}\n\nThe rewrite must sound like the same person wrote it. Preserve sentence rhythm, vocabulary range, POV habits, and dialogue patterns.`
    : ''
  return {
    sys: `You are a New York Times bestselling ${genre || 'fiction'} novelist who has edited dozens of #1 bestsellers. You write at the level of: ${g.anchors}.

${CRAFT_FRAMEWORK}

GENRE BEATS (${genre}):
${g.beats}

EDIT MODE:
${m.directive}${voiceBlock}

OUTPUT RULES:
• Output ONLY the rewritten prose. No commentary, no chapter title repetition, no preamble.
• No markdown headers, no JSON, no labels.
• Plain narrative prose only.`,
    targetWords: m.targetWords,
  }
}

// ─── External API helpers (kept from v4) ──────────────────────────────────────
async function callFal(model: string, prompt: string, sz = 'portrait_4_3'): Promise<string[]> {
  const k = await keys.fal(); if (!k) throw new Error('fal key not found')
  const fast = !model.includes('dev') && !model.includes('gpt-image')
  if (fast) {
    const r = await fetch(`https://fal.run/${model}`, { method: 'POST', headers: { Authorization: `Key ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, image_size: sz, num_images: 1 }) })
    const d = await r.json(); return (d.images || []).map((i: { url: string }) => i.url)
  }
  const qr = await fetch(`https://queue.fal.run/${model}`, { method: 'POST', headers: { Authorization: `Key ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, image_size: sz, num_images: 1 }) })
  const q = await qr.json(); const rid = q.request_id; if (!rid) throw new Error('fal queue failed')
  for (let i = 0; i < 25; i++) {
    await new Promise(r => setTimeout(r, 2000))
    const sr = await fetch(`https://queue.fal.run/${model}/requests/${rid}`, { headers: { Authorization: `Key ${k}` } })
    const s = await sr.json()
    if (s.status === 'COMPLETED') return (s.output?.images || s.images || []).map((i: { url: string }) => i.url)
    if (s.status === 'FAILED') throw new Error('fal failed')
  }
  throw new Error('fal timeout')
}
async function slackPost(ch: string, txt: string) {
  const k = await keys.slack(); if (!k) return
  await fetch('https://slack.com/api/chat.postMessage', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: ch, text: txt }) }).catch(() => {})
}
async function hubspotCreate(title: string, author: string, words: number, score: number): Promise<string | null> {
  const k = await keys.hubspot(); if (!k) return null
  try {
    const r = await fetch('https://api.hubapi.com/crm/v3/objects/deals', { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { dealname: `📚 Book: ${title}`, dealstage: 'closedwon', amount: '0', closedate: new Date().toISOString().split('T')[0], description: `Author: ${author} | ${words.toLocaleString()} words | Score: ${score}/10`, pipeline: 'default' } }) })
    const d = await r.json(); return d.id || null
  } catch { return null }
}
async function saveToDrive(title: string, author: string, html: string): Promise<string> {
  const r = await fetch(`${SB_URL}/functions/v1/nova-drive-upload`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SB_SVC}` }, body: JSON.stringify({ fileName: `${title} — ${author} (KDP).html`, content: html, mimeType: 'text/html', parentId: '1P-UETwfy0b4hZMvsALOsdasPIBQFECxV' }) })
  const d = await r.json(); return d.webViewLink || `https://drive.google.com/drive/folders/1P-UETwfy0b4hZMvsALOsdasPIBQFECxV`
}

// ─── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)
  let body: Record<string, unknown>
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }
  const action = body.action as string

  try {
    // ── Connection diagnostics ───────────────────────────────────────────────
    if (action === 'ping') {
      const [an, fl, sl, hs, el, hg, cv, pi] = await Promise.all([
        keys.anthropic(), keys.fal(), keys.slack(), keys.hubspot(), keys.elevenlabs(), keys.heygen(), keys.canva_id(), keys.pinterest(),
      ])
      return json({ connected: { anthropic: !!an, fal_ai: !!fl, slack: !!sl, hubspot: !!hs, elevenlabs: !!el, heygen: !!hg, canva: !!cv, pinterest: !!pi, google_drive: true, supabase: true } })
    }

    // ── Generic Claude pass-through (defaults to Sonnet for backwards compat) ──
    if (action === 'claude') {
      const t = await ai(
        body.messages as { role: string; content: string }[],
        (body.max_tokens as number) || 4000,
        (body.system as string) || '',
        (body.model as string) || MODEL_SONNET
      )
      return json({ content: [{ type: 'text', text: t }] })
    }

    // ── fal.ai cover image ───────────────────────────────────────────────────
    if (action === 'cover') {
      const urls = await callFal((body.model as string) || 'fal-ai/flux/schnell', body.prompt as string, (body.image_size as string) || 'portrait_4_3')
      return json({ images: urls.map(u => ({ url: u })) })
    }

    // ── Per-chapter analysis (Sonnet — analytical task) ──────────────────────
    if (action === 'analyze') {
      const raw = await ai(
        [{ role: 'user', content: `Developmental editor. Analyze Chapter ${body.number}: "${body.title}".
Return ONLY valid JSON:
{"pacing":"fast/slow/good","issues":["specific issue"],"strengths":["specific strength"],"rewrite_instructions":"3-5 specific actionable directives — what to expand, what to cut, what sensory details to add, what dialogue to layer with subtext, what beat to strengthen","opening_hook":"weak/strong","dialogue_quality":"none/weak/strong","showing_vs_telling":"mostly telling/balanced/mostly showing","sensory_density":"sparse/moderate/rich","prose_grade":"C+/B/A-/A","top_fix":"single most impactful improvement"}
CHAPTER:
${(body.chapter as string).slice(0, 5000)}`.trim() }],
        1200,
        `You are a top-tier ${body.genre} developmental editor. Diagnose precisely and prescribe specific craft fixes — do not give generic feedback.`,
        MODEL_SONNET
      )
      return json({ analysis: raw })
    }

    // ════════════════════════════════════════════════════════════════════════
    // ── REWRITE — Opus 4.7, full craft framework, genre beats, edit mode ────
    // ════════════════════════════════════════════════════════════════════════
    if (action === 'rewrite') {
      const genre        = (body.genre as string) || 'fiction'
      const editMode     = (body.edit_mode as string) || 'rewrite'
      const voiceContext = (body.voice_context as string) || ''
      const chapterText  = body.chapter_text as string
      const originalWords = chapterText.split(/\s+/).filter(Boolean).length

      const { sys, targetWords } = buildRewriteSystemPrompt(genre, voiceContext, editMode, originalWords)

      // Build the user message with all available context
      const sections: string[] = []
      if (body.bible_context) {
        sections.push(`BOOK BIBLE — preserve continuity with these established elements:\n${String(body.bible_context).slice(0, 2000)}`)
      }
      if (body.prev_summary) {
        sections.push(`PREVIOUS CHAPTER (for narrative continuity):\n${body.prev_summary}`)
      }
      if (body.analysis_instructions) {
        sections.push(`EDITOR'S DIAGNOSTIC NOTES — these specific issues MUST be addressed in the rewrite:\n${body.analysis_instructions}`)
      }
      if (body.comp_titles) {
        sections.push(`COMPARABLE BESTSELLERS to match in tone/quality: ${body.comp_titles}`)
      }
      sections.push(`TARGET LENGTH: approximately ${targetWords.toLocaleString()} words`)
      if (Number(body.section_total) > 1) {
        sections.push(`Note: this is section ${body.section_number}/${body.section_total} of a longer chapter. Output plain prose only — the sections will be assembled.`)
      }
      sections.push(`CHAPTER ${body.chapter_number}: ${body.chapter_title}\n\n${chapterText}`)

      const prose = await ai(
        [{ role: 'user', content: sections.join('\n\n────\n\n') }],
        editMode === 'rewrite' ? 12000 : editMode === 'deep' ? 9000 : 6000,
        sys,
        MODEL_OPUS  // ← THE BIG UPGRADE: Opus 4.7 for actual writing
      )
      return json({ text: prose, model: MODEL_OPUS, target_words: targetWords, original_words: originalWords })
    }

    // ── Voice-matching second pass (Opus — needs to nail prose style) ───────
    if (action === 'rewrite_v2') {
      const sys = `You are a voice-matching specialist. Your ONLY job is to make this prose sound like the specific author identified by their voice fingerprint. Match their sentence rhythm, vocabulary range, POV habits, dialogue tag patterns, descriptive density, and idiosyncrasies.

${body.voice_context ? `AUTHOR VOICE FINGERPRINT:\n${body.voice_context}` : ''}

${CRAFT_FRAMEWORK}

OUTPUT RULES:
• Match the voice fingerprint exactly. Same rhythm. Same vocabulary range. Same POV habits.
• Preserve the story content — change HOW it's said, not what happens.
• Output ONLY the voice-matched prose. No commentary.`
      const prose = await ai(
        [{ role: 'user', content: `Match this author's voice. Output ONLY rewritten prose:\n\n${body.chapter_text}` }],
        9000,
        sys,
        MODEL_OPUS
      )
      return json({ text: prose })
    }

    // ── Score (Sonnet — fast analytical) ─────────────────────────────────────
    if (action === 'score') {
      const raw = await ai(
        [{ role: 'user', content: `Rate this ${body.genre} excerpt on bestseller-grade craft (10 = top of the genre).
Return ONLY valid JSON:
{"score":8,"feedback":"2 specific editorial sentences","new_title":"improved title","alt_titles":["a","b","c"],"summary":"1-sentence chapter summary"}
EXCERPT:
${(body.excerpt as string).slice(0, 400)}` }],
        400,
        '',
        MODEL_SONNET
      )
      return json({ raw })
    }

    // ── Bible extraction (Sonnet — structured extraction) ────────────────────
    if (action === 'extract_bible') {
      const raw = await ai(
        [{ role: 'user', content: `Extract Book Bible. Return ONLY valid JSON:
{"characters":[{"name":"","role":"","appearance":"","personality":"","arc":""}],"locations":[{"name":"","description":"","atmosphere":""}],"themes":[""],"timeline":"","writingStyle":"","plotSummary":"","tone":"","centralConflict":""}
MANUSCRIPT:
${(body.manuscript as string).slice(0, 10000)}` }],
        2500,
        'Professional story analyst. Be specific and concrete — no generic descriptions.',
        MODEL_SONNET
      )
      return json({ raw })
    }

    // ── Marketing package (Sonnet — structured copy) ─────────────────────────
    if (action === 'marketing') {
      const raw = await ai(
        [{ role: 'user', content: `KDP marketing for "${body.title}" by ${body.author} (${body.genre}, ${body.words}w).
Return ONLY valid JSON:
{"blurb":"compelling 150-word back-cover blurb","tagline":"powerful 10-word hook","keywords":["k1","k2","k3","k4","k5","k6","k7"],"bisac":["category"],"audience":"2 sentences identifying the ideal reader","backCover":"full back-cover copy with hook + stakes","aplus":"Amazon A+ content — 3 sections (Editorial, From Author, About Author)","socialPosts":{"tiktok":"","instagram":"","twitter":"","linkedin":"","pinterest":""}}
SYNOPSIS:
${body.synopsis}` }],
        3500,
        'KDP marketing expert. Write copy that converts — specific hooks, clear stakes, no generic fluff.',
        MODEL_SONNET
      )
      return json({ raw })
    }

    if (action === 'consistency') {
      const raw = await ai(
        [{ role: 'user', content: `Continuity editor. Find SPECIFIC inconsistencies.
Return ONLY valid JSON or []:
[{"type":"character|timeline|setting|plot","chapter1":1,"chapter2":3,"issue":"description","severity":"minor|major","suggestion":"fix"}]
BOOK BIBLE:
${body.bible}
CHAPTER SUMMARIES:
${body.chapter_summaries}` }],
        2000, '', MODEL_SONNET
      )
      return json({ raw })
    }

    // ── Expand sparse passage (Opus — creative expansion) ────────────────────
    if (action === 'expand') {
      const g = getGenreFramework((body.genre as string) || 'fiction')
      const sys = `You are a bestselling ${body.genre} novelist (${g.anchors}).

${CRAFT_FRAMEWORK}

GENRE BEATS:
${g.beats}

TASK: Expand this sparse passage into a fully-realized scene with sensory grounding, deep interiority, dialogue subtext, and specific concrete details. Target 3-4× the original word count.

OUTPUT: Only the expanded prose. No commentary.`
      const prose = await ai([{ role: 'user', content: body.text as string }], 4000, sys, MODEL_OPUS)
      return json({ text: prose })
    }

    // ── Add sensory description (Opus — craft work) ──────────────────────────
    if (action === 'describe') {
      const sys = `You are a master prose stylist. Add rich sensory grounding to this passage — sight, sound, smell, touch, taste, kinesthetic. Weave details naturally; never list.

${CRAFT_FRAMEWORK}

OUTPUT: Only the enhanced passage. Same length range. No commentary.`
      const prose = await ai([{ role: 'user', content: body.text as string }], 3000, sys, MODEL_OPUS)
      return json({ text: prose })
    }

    // ── Punch up dialogue (Opus — craft work) ────────────────────────────────
    if (action === 'dialogue') {
      const sys = `You are a master of dialogue. Make this dialogue crackle:
• Each character must sound DISTINCT — different rhythm, vocabulary, idioms
• Layer subtext — characters rarely say what they mean
• Cut anything purely informational that could be shown via action
• Add specific physical action between/during exchanges (bodies betray what dialogue conceals)
• End on a beat — surprise, revelation, withdrawal, or escalation

${CRAFT_FRAMEWORK}

OUTPUT: Only the rewritten passage. No commentary.`
      const prose = await ai([{ role: 'user', content: body.text as string }], 3000, sys, MODEL_OPUS)
      return json({ text: prose })
    }

    // ── 3 Alternative rewrites (Opus parallel — distinct styles) ────────────
    if (action === 'alternatives') {
      const genre = (body.genre as string) || 'fiction'
      const g = getGenreFramework(genre)
      const baseSys = (style: string) => `You are a bestselling ${genre} novelist. Style anchors: ${g.anchors}.

${CRAFT_FRAMEWORK}

GENRE BEATS:
${g.beats}

${style}

OUTPUT: Only the rewritten chapter prose. No commentary, no markdown headers.`
      const text = (body.chapter_text as string).slice(0, 4000)
      const [a, b2, c] = await Promise.all([
        ai([{ role: 'user', content: `Rewrite this chapter:\n\n${text}` }], 7000, baseSys('STYLE — CINEMATIC THRILLER PACE: Heavy action beats. Short punchy sentences (often 3-7 words). Visual specificity. Sound and impact. Reader can SEE the scene as a movie. Lee Child rhythm. End on a hook.'), MODEL_OPUS),
        ai([{ role: 'user', content: `Rewrite this chapter:\n\n${text}` }], 7000, baseSys('STYLE — LITERARY DEPTH: Lyrical prose. Deep interiority. Image as meaning. Longer sentences with rhythmic variation. Subtext over plot. Earned epiphany via image, never stated. Marilynne Robinson cadence.'), MODEL_OPUS),
        ai([{ role: 'user', content: `Rewrite this chapter:\n\n${text}` }], 7000, baseSys('STYLE — COMMERCIAL PAGE-TURNER: Hook every 2-3 paragraphs. Strong dialogue with conflict. Visceral emotion. Rising stakes. Each scene MUST end on a beat that compels the next page. Genre satisfaction.'), MODEL_OPUS),
      ])
      return json({ alternatives: [a, b2, c] })
    }

    if (action === 'weak_words') {
      const raw = await ai(
        [{ role: 'user', content: `Professional copy editor. Scan this text.
Return ONLY valid JSON:
{"passive_voice":["example sentence"],"filter_words":["he saw/felt/heard examples"],"cliches":["cliché"],"weak_adverbs":["adverb+verb"],"repeated_words":[{"word":"very","count":3}],"overwrite_score":7,"summary":"2-sentence assessment","top_fix":"single most impactful improvement"}
TEXT:
${(body.text as string).slice(0, 4000)}` }],
        1200,
        'Professional copy editor for commercial fiction. Be specific, not generic.',
        MODEL_SONNET
      )
      return json({ raw })
    }

    if (action === 'plot_arc') {
      const raw = await ai(
        [{ role: 'user', content: `Story structure analyst. Map chapters to 3-act structure.
Return ONLY valid JSON:
{"act1":{"chapters":[1,2,3],"label":"Setup","key_beat":"inciting incident"},"act2a":{"chapters":[4,5,6],"label":"Rising Action","key_beat":""},"midpoint":{"chapter":7,"label":"Midpoint","description":""},"act2b":{"chapters":[8,9,10],"label":"Dark Night","key_beat":""},"act3":{"chapters":[11,12],"label":"Resolution","key_beat":""},"overall_structure":"3-act|hero's journey|5-act","pacing_note":"assessment"}
CHAPTER SUMMARIES:
${(body.summaries as string[]).map((s: string, i: number) => `Ch ${i + 1}: ${s}`).join('\n')}` }],
        1000, '', MODEL_SONNET
      )
      return json({ raw })
    }

    if (action === 'full_analysis') {
      const chaps = body.chapters as { number: number; title: string; text: string }[]
      const synopsis = chaps.map(c => `Ch ${c.number} (${c.title}): ${c.text.slice(0, 400)}`).join('\n')
      const sample = chaps.slice(0, 5).map(c => c.text.slice(0, 800)).join('\n\n')
      const raw = await ai(
        [{ role: 'user', content: `Comprehensive manuscript analyst. Analyze this ${body.genre} manuscript.
Return ONLY valid JSON:
{"pov_issues":[{"chapter":1,"issue":"description"}],"tense_shifts":[{"chapter":1,"example":"shifted from past to present here"}],"sentence_variety_score":7,"show_tell_assessment":"2 sentences on show vs tell balance","overused_phrases":["phrase1","phrase2","phrase3"],"dialogue_assessment":"2 sentences","character_voice_diversity":"do characters sound distinct? 2 sentences","genre_comparison":"how does pacing/dialogue/tension compare to ${body.genre} bestsellers","overall_grade":"B+","top_strengths":["strength1","strength2","strength3"],"top_improvements":["improvement1","improvement2","improvement3"],"manuscript_readiness":"estimated % ready for submission/publication"}
SYNOPSIS:
${synopsis}
SAMPLE (first 5 chapters):
${sample}` }],
        2500,
        `Expert ${body.genre} developmental editor and manuscript analyst.`,
        MODEL_SONNET
      )
      return json({ raw })
    }

    if (action === 'chapter_hooks') {
      const chaps = body.chapters as { number: number; title: string; ending: string }[]
      const raw = await ai(
        [{ role: 'user', content: `Score each chapter ending for hook strength (reader compulsion to continue).
Return ONLY valid JSON array:
[{"chapter":1,"hook_score":8,"hook_type":"cliffhanger|question|revelation|action|emotional|none","ending_summary":"what happens","improvement":"1-sentence tip to strengthen"}]
CHAPTER ENDINGS:
${chaps.map(c => `Ch ${c.number}: ${c.ending}`).join('\n')}` }],
        1500, '', MODEL_SONNET
      )
      return json({ raw })
    }

    if (action === 'brainstorm') {
      const type = body.brainstorm_type as string
      const prompts: Record<string, string> = {
        plot_twists: `Generate 8 unexpected plot twists for "${body.title}" (${body.genre}). Make each genuinely surprising. Return ONLY numbered list, 1 per line.`,
        character_names: `Generate 12 compelling character names for a ${body.genre} novel. Mix of first+last names. Return ONLY numbered list.`,
        scene_ideas: `Generate 8 specific scene ideas for "${body.title}" that would create memorable moments. Return ONLY numbered list.`,
        what_next: `Based on this chapter summary, generate 6 compelling directions the story could go next. Make each distinctly different. Return ONLY numbered list.\nCHAPTER SUMMARY: ${body.context}`,
        chapter_titles: `Generate 10 compelling chapter titles for a ${body.genre} novel. Evocative and specific. Return ONLY numbered list.`,
        conflict_escalations: `Generate 8 ways to escalate conflict/tension from current story state. Return ONLY numbered list.\nCONTEXT: ${body.context}`,
      }
      if (!prompts[type]) return json({ error: `Unknown brainstorm type: ${type}` }, 400)
      const text = await ai([{ role: 'user', content: prompts[type] }], 1000, '', MODEL_SONNET)
      return json({ text })
    }

    // ── Scene generation from brief (Opus — creative writing) ───────────────
    if (action === 'scene_generate') {
      const genre = (body.genre as string) || 'fiction'
      const g = getGenreFramework(genre)
      const sys = `You are a NYT bestselling ${genre} novelist. Style anchors: ${g.anchors}.

${CRAFT_FRAMEWORK}

GENRE BEATS:
${g.beats}

TASK: Generate a complete, vivid scene from the brief below. Bestseller-grade prose.

OUTPUT: Only the scene prose. No commentary, no headers.`
      const prose = await ai(
        [{ role: 'user', content: `Characters: ${body.characters}
Location: ${body.location}
Mood/Tone: ${body.mood}
Event/Conflict: ${body.conflict}
Target length: ${body.length || '500-800'} words` }],
        4000, sys, MODEL_OPUS
      )
      return json({ text: prose })
    }

    if (action === 'kdp_categories') {
      const raw = await ai(
        [{ role: 'user', content: `Amazon KDP category specialist. Recommend 3 specific, profitable KDP subcategory paths for:
Title: "${body.title}" | Genre: ${body.genre} | Description: ${body.blurb}
Focus on SPECIFIC subcategories (not just "Fiction > Thriller") where competition is lower and discoverability is higher.
Return ONLY valid JSON:
[{"category_path":"Kindle Store > Kindle eBooks > Mystery, Thriller & Suspense > Thrillers > Medical","competition":"low|medium|high","discoverability":"high|medium|low","reasoning":"1-2 sentences why this category fits and is strategic","bestseller_rank_to_hit_100":"e.g. ~500 copies/month"}]` }],
        800, '', MODEL_SONNET
      )
      return json({ raw })
    }

    // ── Tools (prologue, epilogue, A+, etc — Opus for prose, Sonnet for structured) ──
    if (action === 'tool') {
      const t = body.tool as string
      const proseTools = ['prologue', 'epilogue']
      const useOpus = proseTools.includes(t)
      const ps: Record<string, string> = {
        prologue: `Write PROLOGUE for "${body.title}" by ${body.author} (${body.genre}). 400-600w. Bestseller-grade prose. Plain prose only.\n${body.synopsis}`,
        epilogue: `Write EPILOGUE. Closure, 300-500w. Bestseller-grade prose. Plain prose only.\n${body.extra}`,
        aplus: `Amazon A+ for "${body.title}" (${body.genre}): 1)Editorial 150w 2)From Author 100w 3)About Author 80w\n${body.synopsis}`,
        sensitivity: `Sensitivity reader. Return ONLY JSON or []: [{"chapter":1,"passage":"","concern":"","severity":"low|medium|high","suggestion":""}]\n${body.synopsis}`,
        audiobook: `Audiobook script formatter. Add [PAUSE][SLOW][FAST][BREATH][VOICE:Name].\n${body.extra}`,
        gumroad: `Complete Gumroad listing. HEADLINE·SUBHEADLINE·DESCRIPTION(200w)·WHO·WHAT·PRICE\n${body.synopsis}`,
        bookclub: `Book club guide. 1.ABOUT 2.THEMES 3.QUESTIONS(10) 4.CHARACTERS 5.AUTHOR NOTE 6.READING LIST\n${body.synopsis}`,
        serial: `Split into 3-5 serial episodes. Return ONLY JSON:\n[{"part":1,"title":"","chapters":[1],"endHook":"","teaser":""}]\n${body.extra}`,
      }
      if (!ps[t]) return json({ error: `Unknown tool: ${t}` }, 400)
      const sys = useOpus
        ? `Bestselling ${body.genre} novelist. ${CRAFT_FRAMEWORK}\n\nOUTPUT: Only the prose. No commentary.`
        : ''
      const text = await ai([{ role: 'user', content: ps[t] }], 3000, sys, useOpus ? MODEL_OPUS : MODEL_SONNET)
      return json({ text })
    }

    // ── Complete book — DB + Drive + HubSpot + Slack ─────────────────────────
    if (action === 'complete') {
      const { title, author, genre, word_count: wc, avg_score: sc, chapters, bible, marketing, covers, html_content: html } = body as Record<string, unknown>
      const words = wc as number, score = sc as number
      const { data: book } = await sb.from('book_projects').upsert({
        title, author, genre,
        word_count: words,
        chapter_count: (chapters as unknown[])?.length || 0,
        avg_score: score, chapters, bible, marketing, covers,
        completed_at: new Date().toISOString(),
      }, { onConflict: 'title' }).select('id').single()
      let driveUrl = ''
      try { if (html) driveUrl = await saveToDrive(title as string, author as string, html as string) } catch { /**/ }
      if (book?.id && driveUrl) await sb.from('book_projects').update({ drive_url: driveUrl }).eq('id', book.id)
      let dealId: string | null = null
      try {
        dealId = await hubspotCreate(title as string, author as string, words, score)
        if (dealId && book?.id) await sb.from('book_projects').update({ hubspot_deal_id: dealId }).eq('id', book.id)
      } catch { /**/ }
      await slackPost('C0AT3NDG5BJ', [
        `📚 *Book Complete: "${title}"*`,
        `Author: ${author} | Genre: ${genre}`,
        `${words.toLocaleString()} words | Score: ${score}/10`,
        driveUrl ? `Drive: ${driveUrl}` : '',
        dealId ? `HubSpot Deal: ${dealId}` : 'HubSpot: no token',
        `DB: ${book?.id || '?'}`,
      ].filter(Boolean).join('\n'))
      return json({ success: true, book_id: book?.id || null, drive_url: driveUrl, hubspot_deal_id: dealId })
    }

    return json({ error: `Unknown action: ${action}` }, 400)
  } catch (e) {
    console.error('book-editor:', e)
    return json({ error: String(e) }, 500)
  }
})
