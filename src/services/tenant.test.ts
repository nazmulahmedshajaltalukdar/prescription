import { describe, expect, it } from 'vitest'
import { buildTenantScopedRecord, canAccessTenantData, filterTenantRecords, getEffectiveScope, withTenantScope } from './tenant'

describe('tenant access rules', () => {
  it('allows a doctor to access only their own sub-tenant data', () => {
    expect(
      canAccessTenantData({
        actorRole: 'doctor',
        actorTenantId: 'tenant-1',
        actorSubTenantId: 'clinic-a',
        resourceTenantId: 'tenant-1',
        resourceSubTenantId: 'clinic-a',
      }),
    ).toBe(true)

    expect(
      canAccessTenantData({
        actorRole: 'doctor',
        actorTenantId: 'tenant-1',
        actorSubTenantId: 'clinic-a',
        resourceTenantId: 'tenant-1',
        resourceSubTenantId: 'clinic-b',
      }),
    ).toBe(false)
  })

  it('allows tenant owner to see all data inside the tenant', () => {
    expect(
      canAccessTenantData({
        actorRole: 'tenant_owner',
        actorTenantId: 'tenant-1',
        actorSubTenantId: 'owner',
        resourceTenantId: 'tenant-1',
        resourceSubTenantId: 'clinic-b',
      }),
    ).toBe(true)
  })

  it('gives clinic administrators access to all locations only within their tenant', () => {
    const scope = getEffectiveScope({ role: 'tenant_admin', tenantId: 'tenant-1', subTenantId: 'clinic-a' })
    const records = [
      { id: 'a', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-a' },
      { id: 'b', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-b' },
      { id: 'c', tenant_id: 'tenant-2', sub_tenant_id: 'clinic-c' },
      { id: 'd', sub_tenant_id: 'clinic-a' },
    ]

    expect(filterTenantRecords(records, scope).map((record) => record.id)).toEqual(['a', 'b'])
    expect(() => withTenantScope(records[2], scope)).toThrow('User does not have access to this tenant record')
    expect(() => buildTenantScopedRecord({ tenant_id: 'tenant-2' }, scope)).toThrow('User does not have access to this tenant record')
  })

  it('does not include unscoped local records for a location-restricted user', () => {
    const records = [
      { id: 'a', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-a' },
      { id: 'b', tenant_id: 'tenant-1' },
      { id: 'c', sub_tenant_id: 'clinic-a' },
    ]
    const scope = getEffectiveScope({ role: 'doctor', tenantId: 'tenant-1', subTenantId: 'clinic-a' })

    expect(filterTenantRecords(records, scope).map((record) => record.id)).toEqual(['a'])
  })

  it('returns a strict scope for doctors and full scope for owner', () => {
    expect(getEffectiveScope({ role: 'doctor', tenantId: 'tenant-1', subTenantId: 'clinic-a' })).toEqual({
      tenantId: 'tenant-1',
      subTenantId: 'clinic-a',
      isPlatformOwner: false,
      canReadAllTenants: false,
      canWriteAllSubTenants: false,
    })

    expect(getEffectiveScope({ role: 'tenant_owner', tenantId: 'tenant-1', subTenantId: 'owner' })).toEqual({
      tenantId: 'tenant-1',
      subTenantId: 'owner',
      isPlatformOwner: false,
      canReadAllTenants: true,
      canWriteAllSubTenants: true,
    })
  })

  it('gives platform owners global read and write scope', () => {
    const scope = getEffectiveScope({ role: 'platform_owner', tenantId: 'platform' })
    expect(scope).toMatchObject({ isPlatformOwner: true, canReadAllTenants: true, canWriteAllSubTenants: true })
    expect(filterTenantRecords([
      { id: 'a', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-a' },
      { id: 'b', tenant_id: 'tenant-2', sub_tenant_id: 'clinic-b' },
    ], scope)).toHaveLength(2)
    expect(canAccessTenantData({
      actorRole: 'platform_owner',
      actorTenantId: 'platform',
      resourceTenantId: 'tenant-2',
      resourceSubTenantId: 'clinic-b',
    })).toBe(true)
  })

  it('filters records by the acting user scope', () => {
    const records = [
      { id: 'p1', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-a', name: 'A' },
      { id: 'p2', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-b', name: 'B' },
      { id: 'p3', tenant_id: 'tenant-2', sub_tenant_id: 'clinic-z', name: 'C' },
    ]

    expect(
      filterTenantRecords(records, getEffectiveScope({ role: 'doctor', tenantId: 'tenant-1', subTenantId: 'clinic-a' })),
    ).toEqual([{ id: 'p1', tenant_id: 'tenant-1', sub_tenant_id: 'clinic-a', name: 'A' }])

    expect(
      filterTenantRecords(records, getEffectiveScope({ role: 'tenant_owner', tenantId: 'tenant-1', subTenantId: 'owner' })),
    ).toHaveLength(2)
  })
})
