export function formatAmount(n) {
  const v = Math.round(Number(n || 0) * 100) / 100
  const [int, dec] = Math.abs(v).toFixed(2).split('.')
  return (v < 0 ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '.' + dec
}

export function formatRs(n) {
  return 'Rs. ' + formatAmount(n)
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// cyrb128 — small, stable, sync hash → 32 hex chars (PDF /ID needs exactly that)
export function stableHash(str) {
  let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= (h2 ^ h3 ^ h4); h2 ^= h1; h3 ^= h1; h4 ^= h1
  return [h1, h2, h3, h4].map(h => (h >>> 0).toString(16).padStart(8, '0')).join('').toUpperCase()
}

export function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '')
}
