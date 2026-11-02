import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = (origin: string) => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Vary': 'Origin',
})

function defaultProjectKey(variable: string, legacy: string) {
  const legacyValue = Deno.env.get(legacy)
  if (legacyValue) return legacyValue
  try {
    const keys = JSON.parse(Deno.env.get(variable) ?? '{}') as Record<string, string>
    return keys.default ?? Object.values(keys)[0] ?? null
  } catch { return null }
}

Deno.serve(async (request) => {
  const appOrigins = (Deno.env.get('APP_ORIGINS') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  const origin = request.headers.get('origin')
  if (!origin || !appOrigins.includes(origin)) return new Response('Origin not allowed', { status: 403 })
  const headers = corsHeaders(origin)
  if (request.method === 'OPTIONS') return new Response('ok', { headers })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers })

  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Authentication required' }, { status: 401, headers })

  const apiUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = defaultProjectKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const serviceKey = defaultProjectKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const brevoKey = Deno.env.get('BREVO_API_KEY')
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL')
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'MENYA Learning'
  if (!apiUrl || !anonKey || !serviceKey || !brevoKey || !senderEmail) return Response.json({ error: 'Email service is not configured.' }, { status: 503, headers })

  const token = authorization.slice('Bearer '.length)
  const authClient = createClient(apiUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: authData, error: authError } = await authClient.auth.getUser(token)
  const user = authData.user
  if (authError || !user?.email || !user.email_confirmed_at) return Response.json({ error: 'A verified signed-in account is required.' }, { status: 401, headers })

  let body: { eventType?: unknown; periodStart?: unknown; minutes?: unknown; sessions?: unknown; attempts?: unknown; correct?: unknown; activeDays?: unknown }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid request body.' }, { status: 400, headers }) }
  const eventType = body.eventType
  let eventKey: string
  let subject: string
  let textContent: string
  let htmlContent: string

  if (eventType === 'welcome') {
    const createdAt = Date.parse(user.created_at)
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > 30 * 24 * 60 * 60 * 1000) return Response.json({ sent: false, reason: 'not_a_new_account' }, { headers })
    eventKey = 'welcome-v1'
    subject = 'Welcome to MENYA'
    textContent = 'Your learning workspace is ready. MENYA saves your study history on this device and syncs it to your account when you are online.'
    htmlContent = '<div style="background:#0A1128;color:#f4f6fb;padding:32px;font-family:Arial,sans-serif"><h1 style="color:#FFD700">Welcome to MENYA</h1><p>Your learning workspace is ready.</p><p>Your study history saves on this device and syncs to your account when you are online.</p><p style="color:#FFD700">Learn. Understand. Evolve.</p></div>'
  } else if (eventType === 'weekly_summary') {
    const periodStart = typeof body.periodStart === 'string' ? body.periodStart : ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodStart) || Number.isNaN(Date.parse(`${periodStart}T00:00:00Z`))) return Response.json({ error: 'A valid periodStart date is required.' }, { status: 400, headers })
    eventKey = `weekly-summary:${periodStart}`
    subject = 'Your MENYA weekly learning summary'
    const metric = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1000000 ? value : 0
    const minutes = metric(body.minutes)
    const sessions = metric(body.sessions)
    const attempts = metric(body.attempts)
    const correct = Math.min(metric(body.correct), attempts)
    const activeDays = Math.min(metric(body.activeDays), 7)
    const stats = `${sessions} sessions · ${minutes} minutes · ${correct}/${attempts} correct · ${activeDays} active days`
    textContent = `Your MENYA weekly learning summary for the week starting ${periodStart}: ${stats}. Open MENYA to review your learning history and progress.`
    htmlContent = `<div style="background:#0A1128;color:#f4f6fb;padding:32px;font-family:Arial,sans-serif"><h1 style="color:#FFD700">Your weekly learning summary</h1><p>Week starting ${periodStart}.</p><p>${stats}</p><p>Open MENYA to review your saved learning history and next focus.</p><p style="color:#FFD700">Learn. Understand. Evolve.</p></div>`
  } else return Response.json({ error: 'Unsupported communication type.' }, { status: 400, headers })

  const admin = createClient(apiUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: claimed, error: claimError } = await admin.rpc('claim_communication_email_event', { p_owner_id: user.id, p_event_key: eventKey, p_event_type: eventType })
  if (claimError) return Response.json({ error: 'Email event could not be queued.' }, { status: 503, headers })
  if (!claimed) return Response.json({ sent: false, accepted: true, duplicate: true }, { status: 202, headers })

  const mail = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': brevoKey, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sender: { email: senderEmail, name: senderName }, to: [{ email: user.email }], subject, textContent, htmlContent, tags: [`menya-${eventType}`] }),
  })
  const result = await mail.json().catch(() => ({}))
  if (!mail.ok) {
    await admin.from('communication_email_events').update({ status: 'failed', last_error: `Brevo returned HTTP ${mail.status}`, updated_at: new Date().toISOString() }).eq('owner_id', user.id).eq('event_key', eventKey)
    return Response.json({ error: 'Email could not be sent.' }, { status: 502, headers })
  }
  await admin.from('communication_email_events').update({ status: 'sent', provider_message_id: result.messageId ?? null, last_error: null, updated_at: new Date().toISOString() }).eq('owner_id', user.id).eq('event_key', eventKey)
  return Response.json({ sent: true }, { headers })
})
