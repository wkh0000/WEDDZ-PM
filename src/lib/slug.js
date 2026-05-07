// src/lib/slug.js
//
// Slug helpers used by create/update flows for entities with
// human-readable URLs (projects, customers, employees).
//
// Strategy:
//   • slugify()              — pure utility: NFD-normalize, drop diacritics,
//                              lowercase, kebab-case, cap at 80 chars.
//   • generateUniqueSlug()   — given a base slug, query the table for any
//                              existing slugs that start with the base, and
//                              find the first free `base`, `base-2`, ...
//   • isUuid()               — detect classic UUID v4 strings, used by detail
//                              pages to fall back to id-lookup when an old
//                              UUID URL is hit.
//
// All API functions in src/features/*/api.js call these on insert/update.

import { supabase } from '@/lib/supabase'

/**
 * Pure slugifier — no DB access. Produces an all-lowercase kebab-case
 * string (a-z, 0-9, hyphens) with diacritics stripped, max 80 chars.
 * Empty input returns "item" so we never produce an empty slug.
 *
 * Examples:
 *   slugify('Mr. Saniru')              → 'mr-saniru'
 *   slugify('Café au Lait!')           → 'cafe-au-lait'
 *   slugify('LMS')                     → 'lms'
 *   slugify('travellers.lk')           → 'travellers-lk'
 *   slugify('   ')                     → 'item'
 */
export function slugify(input) {
  if (input == null) return 'item'
  const str = String(input).trim()
  if (!str) return 'item'

  // NFD-normalize and drop combining marks (U+0300 – U+036F) → strips
  // diacritics like "á → a", "ñ → n" without needing the `unaccent`
  // extension client-side.
  const stripped = str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')   // any run of non-alnum → single hyphen
    .replace(/^-+|-+$/g, '')        // trim leading/trailing hyphens
    .slice(0, 80)

  return slug || 'item'
}

/**
 * Given a base slug and a table, return the first available slug —
 * either the base itself or `base-2`, `base-3`, … if collisions exist.
 *
 * Pass `excludeId` when you're regenerating a slug for an UPDATE so
 * the row's own existing slug doesn't count as a collision.
 *
 * Note: there's a tiny TOCTOU race window between this SELECT and the
 * subsequent INSERT — the API functions catch 23505 unique-violation
 * errors and retry once with a bumped suffix as a backstop.
 */
export async function generateUniqueSlug(table, name, options = {}) {
  const base = slugify(name)
  let q = supabase.from(table).select('slug').like('slug', `${base}%`)
  if (options.excludeId) q = q.neq('id', options.excludeId)
  const { data, error } = await q
  if (error) throw error

  const taken = new Set((data ?? []).map(r => r.slug))
  if (!taken.has(base)) return base

  // Find first free `base-N` starting from N=2
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`
    if (!taken.has(candidate)) return candidate
  }
  // 1000 collisions on one base name is an unrealistic edge case; punt.
  throw new Error(`Could not allocate slug from base "${base}" (1000 collisions)`)
}

/**
 * Does this string look like a UUID v4? Used by detail pages to detect
 * legacy URLs like /projects/<uuid> and redirect to the slug equivalent.
 */
export function isUuid(str) {
  if (typeof str !== 'string') return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
}
