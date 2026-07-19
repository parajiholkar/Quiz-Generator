import * as XLSX from 'xlsx'

/**
 * Parses the raw xlsx bytes Gemini generated (base64) into a simple
 * { sheetName: rows[][] } map, purely for displaying a preview. This never
 * builds or modifies a workbook — only reads the one Gemini already made.
 */
export function parseWorkbookForPreview(fileBase64) {
  const binary = atob(fileBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const wb = XLSX.read(bytes, { type: 'array' })
  const sheets = {}
  for (const name of wb.SheetNames) {
    sheets[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })
  }
  return sheets
}

/**
 * Triggers a browser download of the exact bytes Gemini returned — no
 * re-encoding, no rebuilding, just the file as-is.
 */
export function downloadWorkbook(fileBase64, mimeType, filename) {
  const binary = atob(fileBase64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

  const blob = new Blob([bytes], { type: mimeType || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
