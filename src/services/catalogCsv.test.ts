import { describe, expect, it } from 'vitest'
import { parseCatalogCsv } from './catalogCsv'

describe('parseCatalogCsv', () => {
  it('parses quoted fields, escaped quotes, and pipe-separated search terms', () => {
    expect(parseCatalogCsv('catalog_code,generic_name,brand_name,search_terms\r\nBD-1,Paracetamol,"Brand, ""Plus""",acetaminophen|pain relief')).toEqual([
      {
        catalog_code: 'BD-1',
        generic_name: 'Paracetamol',
        brand_name: 'Brand, "Plus"',
        search_terms: ['acetaminophen', 'pain relief'],
      },
    ])
  })

  it('rejects unfinished quotes and duplicate headers', () => {
    expect(() => parseCatalogCsv('code,name\n1,"unfinished')).toThrow('unfinished quoted field')
    expect(() => parseCatalogCsv('code,code\n1,2')).toThrow('must be unique')
  })
})
