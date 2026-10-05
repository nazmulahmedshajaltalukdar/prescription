export function parseCatalogCsv(text: string) {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
      } else {
        value += character
      }
    } else if (character === '"' && value.length === 0) {
      quoted = true
    } else if (character === ',') {
      row.push(value)
      value = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }
  if (quoted) throw new Error('The CSV contains an unfinished quoted field.')
  if (row.length || value) {
    row.push(value)
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row.')
  const headers = rows[0].map((header, index) => (index === 0 ? header.replace(/^\uFEFF/, '') : header).trim().toLowerCase())
  if (headers.some((header) => !header)) throw new Error('CSV column headers cannot be blank.')
  if (new Set(headers).size !== headers.length) throw new Error('CSV column headers must be unique.')
  return rows.slice(1).map((cells, rowIndex) => {
    if (cells.length > headers.length) throw new Error(`CSV row ${rowIndex + 2} has more cells than the header.`)
    const record: Record<string, unknown> = {}
    headers.forEach((header, index) => {
      const cell = (cells[index] || '').trim()
      record[header] = ['search_terms', 'synonyms'].includes(header)
        ? cell.split('|').map((term) => term.trim()).filter(Boolean)
        : cell
    })
    return record
  })
}
