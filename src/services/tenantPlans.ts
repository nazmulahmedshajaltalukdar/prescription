export type TenantType =
  | 'single_doctor_chamber'
  | 'small_clinic'
  | 'medium_clinic'
  | 'growth_clinic'
  | 'large_group'
  | 'enterprise_group'

export type PlanTier =
  | 'solo_chamber'
  | 'starter_5'
  | 'starter_10'
  | 'standard_20'
  | 'growth_50'
  | 'enterprise_100'

export interface TenantPlan {
  tier: PlanTier
  label: string
  userLimit: number
  subTenantLimit: number
  tenantType: TenantType
  description: string
  features: string[]
  enableInventory: boolean
  enablePharmacy: boolean
  enableBilling: boolean
  enableLabs: boolean
  enableAi: boolean
}

export const tenantPlans: Record<PlanTier, TenantPlan> = {
  solo_chamber: {
    tier: 'solo_chamber',
    label: 'Solo Chamber',
    userLimit: 3,
    subTenantLimit: 1,
    tenantType: 'single_doctor_chamber',
    description: 'Single doctor setup for personal chamber or small private practice.',
    features: ['Patient records', 'Prescription editor', 'Basic reporting'],
    enableInventory: false,
    enablePharmacy: false,
    enableBilling: false,
    enableLabs: false,
    enableAi: false,
  },
  starter_5: {
    tier: 'starter_5',
    label: '5-User Clinic',
    userLimit: 5,
    subTenantLimit: 2,
    tenantType: 'small_clinic',
    description: 'Small clinic bundle for a few doctors and allied staff.',
    features: ['Shared patient records', 'Multi-doctor access', 'Basic inventory'],
    enableInventory: true,
    enablePharmacy: false,
    enableBilling: false,
    enableLabs: false,
    enableAi: false,
  },
  starter_10: {
    tier: 'starter_10',
    label: '10-User Clinic',
    userLimit: 10,
    subTenantLimit: 3,
    tenantType: 'medium_clinic',
    description: 'Medium sized clinic with basic optional modules enabled.',
    features: ['Multi-clinic support', 'Inventory', 'Follow-up workflows'],
    enableInventory: true,
    enablePharmacy: true,
    enableBilling: false,
    enableLabs: false,
    enableAi: false,
  },
  standard_20: {
    tier: 'standard_20',
    label: '20-User Practice',
    userLimit: 20,
    subTenantLimit: 5,
    tenantType: 'growth_clinic',
    description: 'Growing clinic with pharmacy and operational modules.',
    features: ['Role-based access', 'Pharmacy integration', 'Reports and analytics'],
    enableInventory: true,
    enablePharmacy: true,
    enableBilling: true,
    enableLabs: false,
    enableAi: false,
  },
  growth_50: {
    tier: 'growth_50',
    label: '50-User Group',
    userLimit: 50,
    subTenantLimit: 10,
    tenantType: 'large_group',
    description: 'Multi-specialty or multi-branch clinic management for larger organizations.',
    features: ['Multi-branch visibility', 'Audit trail', 'Inventory + labs'],
    enableInventory: true,
    enablePharmacy: true,
    enableBilling: true,
    enableLabs: true,
    enableAi: true,
  },
  enterprise_100: {
    tier: 'enterprise_100',
    label: '100-User Enterprise',
    userLimit: 100,
    subTenantLimit: 20,
    tenantType: 'enterprise_group',
    description: 'Full enterprise workflow with advanced compliance and full module access.',
    features: ['Full multi-tenant management', 'Advanced reporting', 'AI-assisted workflows'],
    enableInventory: true,
    enablePharmacy: true,
    enableBilling: true,
    enableLabs: true,
    enableAi: true,
  },
}

export const planOrder: PlanTier[] = ['solo_chamber', 'starter_5', 'starter_10', 'standard_20', 'growth_50', 'enterprise_100']

export function getPlanByTier(tier: PlanTier): TenantPlan {
  return tenantPlans[tier]
}

export function getPlanForSeatCount(seatCount: number): TenantPlan {
  const ordered = planOrder.map((tier) => tenantPlans[tier])
  return ordered.find((plan) => seatCount <= plan.userLimit) ?? tenantPlans.enterprise_100
}
