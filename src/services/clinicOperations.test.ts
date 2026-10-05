import { describe, expect, it } from 'vitest'
import { calculateInvoiceTotals, createLabOrder, OperationsContext, updateLabOrder } from './clinicOperations'

describe('calculateInvoiceTotals', () => {
  it('calculates and rounds BDT invoice totals to two decimals', () => {
    expect(calculateInvoiceTotals([
      { description: 'Consultation', quantity: 1, unit_price: 350.5 },
      { description: 'Lab fee', quantity: 2, unit_price: 125.25 },
    ], 50)).toEqual({ subtotal: 601, discount: 50, total: 551 })
  })

  describe('laboratory order validation', () => {
    const context: OperationsContext = {
      tenantId: 'clinic-test',
      subTenantId: 'location-test',
      userId: 'user-test',
    }

    it('rejects invalid lab input before persistence', async () => {
      await expect(createLabOrder(context, {
        clientId: 'client-test',
        patientId: 'patient-test',
        testName: 'x'.repeat(161),
      })).rejects.toThrow(/160 characters/)

      await expect(createLabOrder(context, {
        clientId: 'client-test',
        patientId: 'patient-test',
        testName: 'CBC',
        notes: 'x'.repeat(1001),
      })).rejects.toThrow(/1000 characters/)
    })

    it('rejects oversized results before persistence', async () => {
      await expect(updateLabOrder(context, 'order-test', {
        result_text: 'x'.repeat(5001),
      })).rejects.toThrow(/5000 characters/)
    })
  })

  it('rejects empty lines, invalid quantities, negative prices, and excessive discounts', () => {
    expect(() => calculateInvoiceTotals([], 0)).toThrow(/at least one/)
    expect(() => calculateInvoiceTotals([{ description: 'Test', quantity: 0, unit_price: 10 }], 0)).toThrow(/Invoice lines/)
    expect(() => calculateInvoiceTotals([{ description: 'Test', quantity: 1, unit_price: -1 }], 0)).toThrow(/Invoice lines/)
    expect(() => calculateInvoiceTotals([{ description: 'Test', quantity: 1, unit_price: 10 }], 10.01)).toThrow(/cannot exceed/)
  })
})
