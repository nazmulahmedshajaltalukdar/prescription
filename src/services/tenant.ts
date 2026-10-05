export type UserRole = 'platform_owner' | 'tenant_owner' | 'tenant_admin' | 'doctor' | 'pharmacist' | 'nurse' | 'receptionist'

export interface TenantUserContext {
  tenant_id: string
  sub_tenant_id?: string
  role: UserRole
}

export interface TenantScope {
  tenantId: string
  subTenantId?: string
  isPlatformOwner?: boolean
  canReadAllTenants: boolean
  canWriteAllSubTenants: boolean
}

export interface TenantAccessCheck {
  actorRole: UserRole
  actorTenantId: string
  actorSubTenantId?: string
  resourceTenantId: string
  resourceSubTenantId?: string
}

export function getEffectiveScope({
  role,
  tenantId,
  subTenantId,
}: {
  role: UserRole
  tenantId: string
  subTenantId?: string
}): TenantScope {
  if (role === 'platform_owner') {
    return {
      tenantId,
      subTenantId,
      isPlatformOwner: true,
      canReadAllTenants: true,
      canWriteAllSubTenants: true,
    }
  }

  if (role === 'tenant_owner') {
    return {
      tenantId,
      subTenantId,
      isPlatformOwner: false,
      canReadAllTenants: true,
      canWriteAllSubTenants: true,
    }
  }

  if (role === 'tenant_admin') {
    return {
      tenantId,
      subTenantId,
      isPlatformOwner: false,
      canReadAllTenants: true,
      canWriteAllSubTenants: true,
    }
  }

  if (role === 'doctor' || role === 'pharmacist' || role === 'nurse' || role === 'receptionist') {
    return {
      tenantId,
      subTenantId,
      isPlatformOwner: false,
      canReadAllTenants: false,
      canWriteAllSubTenants: false,
    }
  }

  return {
    tenantId,
    subTenantId,
    isPlatformOwner: false,
    canReadAllTenants: false,
    canWriteAllSubTenants: false,
  }
}

export function canAccessTenantData({
  actorRole,
  actorTenantId,
  actorSubTenantId,
  resourceTenantId,
  resourceSubTenantId,
}: TenantAccessCheck): boolean {
  if (!resourceTenantId) {
    return false
  }

  if (actorRole === 'platform_owner') return true
  if (!actorTenantId) return false

  if (actorTenantId !== resourceTenantId) {
    return false
  }

  if (actorRole === 'tenant_owner') {
    return true
  }

  if (actorRole === 'tenant_admin') {
    return true
  }

  if (!actorSubTenantId) {
    return false
  }

  if (!resourceSubTenantId) {
    return false
  }

  return actorSubTenantId === resourceSubTenantId
}

export interface TenantRecord {
  id?: string | number
  tenant_id?: string
  sub_tenant_id?: string
  created_by?: string
  created_at?: string
}

export function buildTenantScopedRecord<T extends TenantRecord>(record: Partial<T>, scope: TenantScope): T {
  if (!scope.isPlatformOwner && record.tenant_id && record.tenant_id !== scope.tenantId) {
    throw new Error('User does not have access to this tenant record')
  }

  if (!scope.canWriteAllSubTenants && record.sub_tenant_id && record.sub_tenant_id !== scope.subTenantId) {
    throw new Error('User does not have access to this sub-tenant record')
  }

  return {
    ...record,
    tenant_id: record.tenant_id || scope.tenantId,
    sub_tenant_id: record.sub_tenant_id ?? scope.subTenantId,
  } as T
}

export function filterTenantRecords<T extends TenantRecord>(records: T[], scope: TenantScope): T[] {
  if (!records.length) {
    return []
  }

  if (scope.isPlatformOwner) {
    return records
  }

  if (scope.canReadAllTenants) {
    return records.filter((record) => record.tenant_id === scope.tenantId)
  }

  if (scope.subTenantId) {
    return records.filter(
      (record) => record.tenant_id === scope.tenantId && record.sub_tenant_id === scope.subTenantId,
    )
  }

  return records.filter((record) => record.tenant_id === scope.tenantId)
}

export function withTenantScope<T extends TenantRecord>(record: T, scope: TenantScope): T {
  if (scope.isPlatformOwner) {
    return record
  }

  if (record.tenant_id !== scope.tenantId) {
    throw new Error('User does not have access to this tenant record')
  }

  if (!scope.canReadAllTenants && scope.subTenantId && record.sub_tenant_id !== scope.subTenantId) {
    throw new Error('User does not have access to this sub-tenant record')
  }

  return record
}
