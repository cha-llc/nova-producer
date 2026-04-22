// book-fal-proxy v1 — fal.ai image generation for Book Editor covers
// Models: fal-ai/flux/schnell (fast) | fal-ai/flux/dev (quality) | openai/gpt-image-2 (premium)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SB_URL = Deno.env.get('SUPABASE_URL')!
const SB_SVC = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const sb     = createClient(SB_URL, SB_SVC)

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
}
const json = (d: unknown, s = 200) =>
  new Response(JSON.stringify(d), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

async function getFalKey(): Promise<string> {
  try {
    const { data } = await sb.rpc('vault_read_fal_key').catch(() => ({ data: null }))
    if (data && String(data).length > 10) return String(data).trim()
  } catch { /* */ }
  const k = Deno.env.get('FAL_KEY')?.trim()
  if (k && k.length > 10) return k
  throw new Error('FAL_KEY not configured. Add it to Supabase Vault: SELECT vault.create_secret(\'your_fal_key\', \'fal_key\')')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST')    return json({ error: 'POST only' }, 405)

  let body: { model?: string; prompt: string; image_size?: string; num_images?: number }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const {
    model      = 'fal-ai/flux/schnell',
    prompt,
    image_size = 'portrait_4_3',
    num_images = 1,
  } = body

  if (!prompt) return json({ error: 'prompt required' }, 400)

  let falKey: string
  try { falKey = await getFalKey() }
  catch (e) { return json({ error: String(e), fallback: true }, 503) }

  // Use fal.run (synchronous) for fast models, queue for slower ones
  const endpoint = model.includes('flux/dev') || model.includes('gpt-image')
    ? `https://queue.fal.run/${model}`
    : `https://fal.run/${model}`

  try {
    if (endpoint.startsWith('https://fal.run')) {
      // Synchronous — returns result directly
      const r = await fetch(endpoint, {
        method:  'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, image_size, num_images }),
      })
      const data = await r.json()
      if (!r.ok) return json({ error: data?.detail || 'fal.ai error', details: data }, r.status)
      return json({ images: data.images || data.data?.images || [] })
    } else {
      // Queue — submit then poll
      const submitR = await fetch(endpoint, {
        method:  'POST',
        headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ prompt, image_size, num_images }),
      })
      const submit = await submitR.json()
      const requestId = submit.request_id
      if (!requestId) return json({ error: 'Queue submit failed', details: submit }, 500)

      // Poll up to 55 seconds
      for (let i = 0; i < 27; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const statusR = await fetch(`https://queue.fal.run/${model}/requests/${requestId}`, {
          headers: { Authorization: `Key ${falKey}` }
        })
        const status = await statusR.json()
        if (status.status === 'COMPLETED') {
          return json({ images: status.output?.images || status.images || [] })
        }
        if (status.status === 'FAILED') return json({ error: 'Generation failed', details: status }, 500)
      }
      return json({ error: 'Generation timed out — try a faster model like flux/schnell' }, 504)
    }
  } catch (e) {
    return json({ error: String(e) }, 500)
  }
})
