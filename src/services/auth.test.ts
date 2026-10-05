import { describe, expect, it } from 'vitest'
import { createDemoUser } from './auth'

describe('createDemoUser', () => {
  it('creates a valid demo user from an email and assigns tenant scope automatically', () => {
    const user = createDemoUser('doctor@clinic.test', 'Dr. Ahmed')

    expect(user.email).toBe('doctor@clinic.test')
    expect(user.full_name).toBe('Dr. Ahmed')
    expect(user.role).toBe('doctor')
    expect(user.tenant_id).toBe('tenant-demo')
    expect(user.sub_tenant_id).toBe('clinic-demo')
    expect(user.plan_tier).toBe('starter_5')
    expect(user.id).toMatch(/^demo-/)
  })
})
