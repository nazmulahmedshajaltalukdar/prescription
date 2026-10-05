import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('APP_ORIGIN') || 'http://localhost:5173'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const maxInputLength = 12_000
const maxOutputLength = 8_000
const defaultProviderUrl = 'https://api.openai.com/v1/chat/completions'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function configuredProviderUrl(): string | null {
  const configuredUrl = Deno.env.get('AI_API_URL') || defaultProviderUrl
  try {
    const url = new URL(configuredUrl)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}

Deno.serve(async (request) => {
  if (request.headers.get('Origin') && request.headers.get('Origin') !== allowedOrigin) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication is required.' }, 401)

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: 'AI note assistance is not configured on the server.' }, 503)
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid or expired session.' }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from('profiles')
      .select('role, tenant_id, sub_tenant_id, is_active')
      .eq('id', user.id)
      .maybeSingle()
    if (actorError) return json({ error: 'Unable to verify clinic access.' }, 503)
    if (!actor?.is_active || !actor.tenant_id) {
      return json({ error: 'An active clinic account is required.' }, 403)
    }
    if (!['tenant_owner', 'tenant_admin', 'doctor', 'pharmacist', 'nurse', 'receptionist'].includes(actor.role)) {
      return json({ error: 'An active clinic user is required.' }, 403)
    }
    if (!actor.sub_tenant_id) return json({ error: 'An active clinic location is required.' }, 403)

    const { data: location, error: locationError } = await adminClient
      .from('clinic_locations')
      .select('is_active')
      .eq('tenant_id', actor.tenant_id)
      .eq('id', actor.sub_tenant_id)
      .maybeSingle()
    if (locationError) return json({ error: 'Unable to verify clinic location access.' }, 503)
    if (!location?.is_active) return json({ error: 'An active clinic location is required.' }, 403)

    const { data: tenant, error: tenantError } = await adminClient
      .from('tenants')
      .select('status, modules')
      .eq('id', actor.tenant_id)
      .maybeSingle()
    if (tenantError) return json({ error: 'Unable to verify clinic access.' }, 503)
    if (!tenant || tenant.status !== 'active') {
      return json({ error: 'An active clinic workspace is required.' }, 403)
    }
    if (!isPlainObject(tenant.modules) || tenant.modules.ai !== true) {
      return json({ error: 'AI note assistance is not enabled for this clinic.' }, 403)
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return json({ error: 'Request body must be valid JSON.' }, 400)
    }
    if (!isPlainObject(body) || !['summarize', 'draft'].includes(String(body.action))) {
      return json({ error: 'Choose a supported note action.' }, 400)
    }
    if (typeof body.text !== 'string' || !body.text.trim()) {
      return json({ error: 'Enter text to summarize or organize.' }, 400)
    }
    if (body.text.length > maxInputLength) {
      return json({ error: `Input must be ${maxInputLength} characters or fewer.` }, 400)
    }

    const apiKey = Deno.env.get('AI_API_KEY')
    if (!apiKey) {
      return json({ error: 'AI note assistance is unavailable: the AI provider is not configured.' }, 503)
    }
    const providerUrl = configuredProviderUrl()
    if (!providerUrl) {
      return json({ error: 'AI note assistance is unavailable: provider configuration is invalid.' }, 503)
    }

    const action = body.action as 'summarize' | 'draft'
    const systemPrompt = [
      'You help clinicians prepare administrative documentation from text they explicitly provide.',
      'Return only a concise administrative note draft that accurately reflects the source text.',
      'Do not add facts, infer missing information, diagnose, recommend treatment, or prescribe.',
      'If the source asks for medical decisions, do not perform them; only organize the supplied facts.',
      'Preserve uncertainty and clearly flag missing or ambiguous information instead of guessing.',
      `Requested action: ${action === 'summarize' ? 'summarize the source text' : 'organize the source as a note'}.`,
      'This output is a draft and must be reviewed by a clinician before use.',
    ].join(' ')

    let providerResponse: Response
    try {
      providerResponse = await fetch(providerUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: Deno.env.get('AI_MODEL') || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: body.text },
          ],
          temperature: 0.2,
          max_tokens: 1200,
        }),
        signal: AbortSignal.timeout(30_000),
      })
    } catch {
      return json({ error: 'The AI provider is temporarily unavailable. Please try again.' }, 502)
    }
    if (!providerResponse.ok) {
      return json({ error: 'The AI provider could not generate a draft. Please try again.' }, 502)
    }

    let providerBody: unknown
    try {
      providerBody = await providerResponse.json()
    } catch {
      return json({ error: 'The AI provider returned an invalid response.' }, 502)
    }
    const choices = isPlainObject(providerBody) && Array.isArray(providerBody.choices) ? providerBody.choices : []
    const firstChoice = choices[0]
    const message =
      isPlainObject(firstChoice) && isPlainObject(firstChoice.message) ? firstChoice.message : null
    const draft = message && typeof message.content === 'string' ? message.content.trim() : ''
    if (!draft || draft.length > maxOutputLength) {
      return json({ error: 'The AI provider returned an invalid draft.' }, 502)
    }

    return json({ draft })
  } catch {
    return json({ error: 'Unable to process the note request.' }, 500)
  }
})
