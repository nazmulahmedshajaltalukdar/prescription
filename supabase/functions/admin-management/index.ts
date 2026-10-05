import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const allowedOrigin = Deno.env.get('APP_ORIGIN') || 'http://localhost:5173'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const planTiers = ['solo_chamber', 'starter_5', 'starter_10', 'standard_20', 'growth_50', 'enterprise_100']
const staffRoles = ['doctor', 'pharmacist', 'nurse', 'receptionist']
const clinicRoles = [...staffRoles, 'tenant_admin', 'tenant_owner']
const moduleNames = ['inventory', 'pharmacy', 'billing', 'labs', 'ai']
const planLimits: Record<string, { users: number; locations: number }> = {
  solo_chamber: { users: 3, locations: 1 },
  starter_5: { users: 5, locations: 2 },
  starter_10: { users: 10, locations: 3 },
  standard_20: { users: 20, locations: 5 },
  growth_50: { users: 50, locations: 10 },
  enterprise_100: { users: 100, locations: 20 },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`)
  return value.trim()
}

function optionalText(value: unknown, maxLength = 500) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (normalized.length > maxLength) throw new Error(`Catalog field exceeds ${maxLength} characters.`)
  return normalized || null
}

function stringList(value: unknown) {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split('|')
      : []
  if (items.some((item) => typeof item !== 'string')) throw new Error('Search terms must be text.')
  const normalized = items as string[]
  if (normalized.length > 30) throw new Error('Use no more than 30 synonyms or search terms per row.')
  return normalized
    .map((item) => item.trim())
    .filter(Boolean)
}

function requiredCatalogText(value: unknown, field: string, maxLength: number) {
  const normalized = requiredText(value, field)
  if (normalized.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`)
  return normalized
}

Deno.serve(async (request) => {
  if (request.headers.get('Origin') && request.headers.get('Origin') !== allowedOrigin) {
    return json({ error: 'Origin is not allowed.' }, 403)
  }
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405)
  const contentLength = Number(request.headers.get('Content-Length') || 0)
  if (contentLength > 600_000) return json({ error: 'Import batch is too large; use smaller CSV batches.' }, 413)

  try {
    const authorization = request.headers.get('Authorization')
    if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication is required.' }, 401)

    const url = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !anonKey || !serviceKey) throw new Error('Admin function is missing Supabase server configuration.')

    const userClient = createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const adminClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) return json({ error: 'Invalid or expired session.' }, 401)

    const { data: actor, error: actorError } = await adminClient
      .from('profiles')
      .select('role, tenant_id, sub_tenant_id, is_active')
      .eq('id', user.id)
      .maybeSingle()
    if (actorError) throw actorError
    if (!actor || !actor.is_active) return json({ error: 'Active clinic profile required.' }, 403)

    const isPlatformOwner = actor.role === 'platform_owner'
    const isClinicAdmin = actor.role === 'tenant_owner' || actor.role === 'tenant_admin'
    if (!isPlatformOwner && !isClinicAdmin) return json({ error: 'Administrator access required.' }, 403)

    const body = await request.json()
    const action = requiredText(body.action, 'Action')
    const tenantId = isPlatformOwner
      ? (typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '')
      : actor.tenant_id

    if (action === 'import_medicine_catalog' || action === 'import_clinical_terms') {
      if (!isPlatformOwner) return json({ error: 'Platform owner access required.' }, 403)
      if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 250) {
        return json({ error: 'Import 1 to 250 rows per request.' }, 400)
      }
      const sourceName = requiredCatalogText(body.source_name, 'Source name', 160)
      const sourceUrl = requiredCatalogText(body.source_url, 'Source URL', 2048)
      const sourceLicense = requiredCatalogText(body.source_license, 'Source license or permission', 300)
      const sourceRevision = requiredCatalogText(body.source_revision, 'Source revision', 120)
      const verifiedAt = requiredText(body.verified_at, 'Verification date')
      try {
        const url = new URL(sourceUrl)
        if (url.protocol !== 'https:') throw new Error('Source URL must use HTTPS.')
      } catch {
        return json({ error: 'Enter a valid HTTPS source URL.' }, 400)
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) || Number.isNaN(Date.parse(`${verifiedAt}T00:00:00Z`))) {
        return json({ error: 'Verification date must use YYYY-MM-DD.' }, 400)
      }

      const records = body.records.map((value: unknown) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Every catalog row must be an object.')
        const row = value as Record<string, unknown>
        const provenance = {
          source_name: sourceName,
          source_url: sourceUrl,
          source_license: sourceLicense,
          source_revision: sourceRevision,
          verified_at: verifiedAt,
          updated_at: new Date().toISOString(),
          is_active: true,
        }
        if (action === 'import_medicine_catalog') {
          return {
            ...provenance,
            catalog_code: requiredCatalogText(row.catalog_code, 'Catalog code', 120),
            generic_name: requiredCatalogText(row.generic_name, 'Generic name', 200),
            brand_name: optionalText(row.brand_name, 160),
            strength: optionalText(row.strength, 120),
            dosage_form: optionalText(row.dosage_form, 120),
            manufacturer: optionalText(row.manufacturer, 200),
            registration_no: optionalText(row.registration_no, 120),
            search_terms: stringList(row.search_terms),
          }
        }
        const category = requiredText(row.category, 'Term category')
        if (!['chief_complaint', 'disease'].includes(category)) throw new Error('Term category must be chief_complaint or disease.')
        return {
          ...provenance,
          code: requiredCatalogText(row.code, 'Term code', 120),
          category,
          label_en: requiredCatalogText(row.label_en, 'English term', 200),
          label_bn: optionalText(row.label_bn, 160),
          synonyms: stringList(row.synonyms),
          classification_system: optionalText(row.classification_system, 120),
          classification_code: optionalText(row.classification_code, 120),
        }
      })
      const identifiers = records.map((record) => {
        const row = record as Record<string, unknown>
        return action === 'import_medicine_catalog' ? row.catalog_code : row.code
      })
      if (new Set(identifiers).size !== identifiers.length) return json({ error: 'Each CSV batch must contain unique catalog codes.' }, 400)
      const table = action === 'import_medicine_catalog' ? 'medicine_catalog' : 'clinical_reference_terms'
      const conflictColumn = action === 'import_medicine_catalog' ? 'catalog_code' : 'code'
      const { error: importError } = await adminClient.from(table).upsert(records, { onConflict: conflictColumn })
      if (importError) throw importError
      return json({ imported: records.length, catalog: table, source_revision: sourceRevision })
    }

    if (action === 'list_tenants') {
      if (!isPlatformOwner) return json({ error: 'Platform owner access required.' }, 403)
      const { data, error } = await adminClient.from('tenants').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return json({ tenants: data })
    }

    if (action === 'save_tenant') {
      if (!isPlatformOwner) return json({ error: 'Platform owner access required.' }, 403)
      const id = requiredText(body.id, 'Tenant ID')
      const name = requiredText(body.name, 'Tenant name')
      const planTier = requiredText(body.plan_tier, 'Plan')
      const status = body.status === 'suspended' ? 'suspended' : 'active'
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(id)) return json({ error: 'Tenant ID may contain letters, numbers, underscores, and hyphens.' }, 400)
      if (!planTiers.includes(planTier)) return json({ error: 'Invalid subscription plan.' }, 400)
      const modules = Object.fromEntries(moduleNames.map((module) => [module, Boolean(body.modules?.[module])]))
      const { data: existingTenant, error: existingTenantError } = await adminClient
        .from('tenants')
        .select('plan_tier')
        .eq('id', id)
        .maybeSingle()
      if (existingTenantError) throw existingTenantError
      if (existingTenant && existingTenant.plan_tier !== planTier) {
        const limit = planLimits[planTier]
        if (limit) {
          const { count: userCount, error: userCountError } = await adminClient
            .from('profiles')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', id)
            .eq('is_active', true)
          if (userCountError) throw userCountError
          if (userCount !== null && userCount > limit.users) {
            return json({ error: `This clinic has ${userCount} active users; suspend users before changing to the ${limit.users}-user plan.` }, 409)
          }

          const { count: locationCount, error: locationCountError } = await adminClient
            .from('clinic_locations')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', id)
            .eq('is_active', true)
          if (locationCountError) throw locationCountError
          if (locationCount !== null && locationCount > limit.locations) {
            return json({ error: `This clinic has ${locationCount} active locations; deactivate locations before changing to the ${limit.locations}-location plan.` }, 409)
          }
        }
      }
      const { data, error } = await adminClient
        .from('tenants')
        .upsert({ id, name, plan_tier: planTier, status, modules }, { onConflict: 'id' })
        .select('*')
        .single()
      if (error) throw error
      const { error: profilesError } = await adminClient.from('profiles').update({ plan_tier: planTier }).eq('tenant_id', id)
      if (profilesError) throw profilesError
      const { data: locations, error: locationsError } = await adminClient
        .from('clinic_locations')
        .select('id')
        .eq('tenant_id', id)
        .limit(1)
      if (locationsError) throw locationsError
      if (!locations?.length) {
        const locationId = `${id}-main`.slice(0, 64)
        const { error: locationCreateError } = await adminClient.from('clinic_locations').insert({
          tenant_id: id,
          id: locationId,
          name: 'Main clinic',
          is_active: true,
        })
        if (locationCreateError) throw locationCreateError
      }
      return json({ tenant: data })
    }

    if (action === 'list_users') {
      if (isPlatformOwner && !tenantId) return json({ error: 'Select a clinic first.' }, 400)
      const { data, error } = await adminClient
        .from('profiles')
        .select('id, full_name, role, tenant_id, sub_tenant_id, plan_tier, is_active, created_at')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return json({ users: data })
    }

    if (action === 'invite_user') {
      if (isPlatformOwner && !tenantId) return json({ error: 'Select a clinic first.' }, 400)
      const email = requiredText(body.email, 'Email').toLowerCase()
      const fullName = requiredText(body.full_name, 'Full name')
      const role = requiredText(body.role, 'Role')
      const subTenantId = requiredText(body.sub_tenant_id, 'Clinic location')
      const allowedRoles = isPlatformOwner ? clinicRoles : staffRoles
      if (!allowedRoles.includes(role)) return json({ error: 'You cannot assign this role.' }, 403)
      const { data: location, error: locationError } = await adminClient
        .from('clinic_locations')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('id', subTenantId)
        .eq('is_active', true)
        .maybeSingle()
      if (locationError) throw locationError
      if (!location) return json({ error: 'Select an active clinic location.' }, 400)
      const { data: tenant, error: tenantError } = await adminClient.from('tenants').select('plan_tier, status').eq('id', tenantId).single()
      if (tenantError) throw tenantError
      if (tenant.status !== 'active') return json({ error: 'Cannot invite users to a suspended clinic.' }, 409)
      const limit = planLimits[tenant.plan_tier]
      const { count, error: countError } = await adminClient.from('profiles').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true)
      if (countError) throw countError
      if (count !== null && limit && count >= limit.users) return json({ error: `This clinic has reached its ${limit.users}-user plan limit.` }, 409)

      const { data: invited, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo: `${Deno.env.get('APP_ORIGIN') || 'http://localhost:5173'}/set-password`,
      })
      if (inviteError) throw inviteError
      if (!invited.user) throw new Error('Supabase did not return the invited account.')
      const { error: profileError } = await adminClient.from('profiles').upsert({
        id: invited.user.id,
        full_name: fullName,
        role,
        tenant_id: tenantId,
        sub_tenant_id: subTenantId,
        plan_tier: tenant.plan_tier,
        is_active: true,
      }, { onConflict: 'id' })
      if (profileError) throw profileError
      return json({ invited: true, user_id: invited.user.id })
    }

    if (action === 'update_user') {
      if (isPlatformOwner && !tenantId) return json({ error: 'Select a clinic first.' }, 400)
      const targetId = requiredText(body.user_id, 'User ID')
      const { data: target, error: targetError } = await adminClient
        .from('profiles')
        .select('id, role, tenant_id, is_active')
        .eq('id', targetId)
        .eq('tenant_id', tenantId)
        .maybeSingle()
      if (targetError) throw targetError
      if (!target) return json({ error: 'User not found in this clinic.' }, 404)
      if (target.role === 'platform_owner' || target.id === user.id) return json({ error: 'This account cannot be managed here.' }, 403)
      if (!isPlatformOwner && !staffRoles.includes(target.role)) return json({ error: 'Only a platform owner can manage clinic administrators.' }, 403)

      if (body.is_active === true && !target.is_active) {
        const { data: tenant, error: tenantError } = await adminClient
          .from('tenants')
          .select('plan_tier, status')
          .eq('id', tenantId)
          .single()
        if (tenantError) throw tenantError
        if (tenant.status !== 'active') return json({ error: 'Cannot restore users in a suspended clinic.' }, 409)
        const limit = planLimits[tenant.plan_tier]
        const { count, error: countError } = await adminClient
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        if (countError) throw countError
        if (count !== null && limit && count >= limit.users) {
          return json({ error: `This clinic has reached its ${limit.users}-user plan limit.` }, 409)
        }
      }

      const changes: Record<string, unknown> = {}
      if (typeof body.is_active === 'boolean') changes.is_active = body.is_active
      if (typeof body.role === 'string') {
        const allowedRoles = isPlatformOwner ? clinicRoles : staffRoles
        if (!allowedRoles.includes(body.role)) return json({ error: 'You cannot assign this role.' }, 403)
        changes.role = body.role
      }
      if (typeof body.sub_tenant_id === 'string') {
        const { data: location, error: locationError } = await adminClient
          .from('clinic_locations')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('id', body.sub_tenant_id)
          .eq('is_active', true)
          .maybeSingle()
        if (locationError) throw locationError
        if (!location) return json({ error: 'Select an active clinic location.' }, 400)
        changes.sub_tenant_id = body.sub_tenant_id
      }
      if (typeof body.full_name === 'string') changes.full_name = requiredText(body.full_name, 'Full name')
      const { error: updateError } = await adminClient.from('profiles').update(changes).eq('id', targetId)
      if (updateError) throw updateError
      if (typeof body.is_active === 'boolean') {
        const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetId, {
          ban_duration: body.is_active ? 'none' : '876000h',
        })
        if (authUpdateError) throw authUpdateError
      }
      return json({ updated: true })
    }

    if (action === 'list_locations') {
      if (isPlatformOwner && !tenantId) return json({ error: 'Select a clinic first.' }, 400)
      const { data, error } = await adminClient
        .from('clinic_locations')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return json({ locations: data })
    }

    if (action === 'save_location') {
      if (!isPlatformOwner && !isClinicAdmin) return json({ error: 'Clinic administrator or platform owner access required.' }, 403)
      if (!tenantId) return json({ error: 'Select a clinic first.' }, 400)
      const id = requiredText(body.id, 'Location ID')
      const name = requiredText(body.name, 'Location name')
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,62}$/.test(id)) return json({ error: 'Location ID may contain letters, numbers, underscores, and hyphens.' }, 400)
      const { data: tenant, error: tenantError } = await adminClient.from('tenants').select('plan_tier').eq('id', tenantId).single()
      if (tenantError) throw tenantError
      const { data: existingLocation, error: existingLocationError } = await adminClient.from('clinic_locations').select('id, is_active').eq('tenant_id', tenantId).eq('id', id).maybeSingle()
      if (existingLocationError) throw existingLocationError
      const limit = planLimits[tenant.plan_tier]
      if ((!existingLocation || (!existingLocation.is_active && body.is_active !== false)) && limit) {
        const { count, error: countError } = await adminClient
          .from('clinic_locations')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('is_active', true)
        if (countError) throw countError
        if (count !== null && count >= limit.locations) return json({ error: `This clinic has reached its ${limit.locations}-location plan limit.` }, 409)
      }
      const { data, error } = await adminClient.from('clinic_locations')
        .upsert({ tenant_id: tenantId, id, name, address: typeof body.address === 'string' ? body.address.trim() : null, is_active: body.is_active !== false }, { onConflict: 'tenant_id,id' })
        .select('*')
        .single()
      if (error) throw error
      return json({ location: data })
    }

    return json({ error: 'Unsupported admin action.' }, 400)
  } catch (error) {
    console.error('Admin management request failed', error)
    return json({ error: error instanceof Error ? error.message : 'Admin management request failed.' }, 400)
  }
})
