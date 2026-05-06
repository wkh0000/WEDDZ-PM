import { format, parseISO } from 'date-fns'

/**
 * Format a numeric value as Sri Lankan Rupees with comma grouping.
 * @example formatLKR(125000)    => "LKR 125,000.00"
 * @example formatLKR(1234.5)    => "LKR 1,234.50"
 * @example formatLKR(null)      => "LKR 0.00"
 */
export function formatLKR(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'LKR 0.00'
  return 'LKR ' + n.toLocaleString('en-LK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

/**
 * Compact LKR for stat cards: 1.2M, 450K, 1.5B.
 */
export function formatLKRCompact(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return 'LKR 0'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return `${sign}LKR ${(abs / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (abs >= 1_000_000)     return `${sign}LKR ${(abs / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (abs >= 1_000)         return `${sign}LKR ${(abs / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return `${sign}LKR ${abs.toFixed(0)}`
}

/**
 * Format a date as "06 May 2026". Accepts ISO string, Date, or null.
 */
export function formatDate(value) {
  if (!value) return '—'
  try {
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'dd MMM yyyy')
  } catch {
    return '—'
  }
}

/**
 * Format a timestamp as "06 May 2026, 14:32".
 */
export function formatDateTime(value) {
  if (!value) return '—'
  try {
    const d = typeof value === 'string' ? parseISO(value) : value
    return format(d, 'dd MMM yyyy, HH:mm')
  } catch {
    return '—'
  }
}

/**
 * Format a (year, month) pair as "May 2026".
 */
export function formatMonth(year, month) {
  if (!year || !month) return '—'
  try {
    return format(new Date(year, month - 1, 1), 'MMMM yyyy')
  } catch {
    return '—'
  }
}

/**
 * Initials from a full name. "Wachindra Kasun" => "WK".
 */
export function initials(name) {
  if (!name) return '?'
  const parts = String(name).trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/**
 * Truncate text to N chars with ellipsis.
 */
export function truncate(text, max = 80) {
  if (!text) return ''
  return text.length > max ? text.slice(0, max - 1) + '…' : text
}
