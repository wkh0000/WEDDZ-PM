import { supabase } from '@/lib/supabase'

export async function listProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, role, active, avatar_url, created_at, employee_id')
    .order('created_at', { ascending: true })
  if (error) throw error
  return data
}

export async function createTeamMember({ email, full_name, password, role }) {
  const { data, error } = await supabase.functions.invoke('create-team-member', {
    body: { email, full_name, password, role }
  })
  if (error) {
    // supabase-js wraps non-2xx responses; surface JSON body if any
    const body = error.context?.body
    if (body && typeof body === 'object' && body.error) throw new Error(body.error)
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data?.user
}

export async function updateProfile(id, updates) {
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function setProfileRole(id, role) {
  return updateProfile(id, { role })
}

export async function setProfileActive(id, active) {
  return updateProfile(id, { active })
}

/** Generate a strong-but-readable temp password */
export function generateTempPassword(length = 12) {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const all = lower + upper + digits
  // ensure at least one of each class
  const required = [
    lower[Math.floor(Math.random() * lower.length)],
    upper[Math.floor(Math.random() * upper.length)],
    digits[Math.floor(Math.random() * digits.length)]
  ]
  const rest = Array.from({ length: length - required.length },
    () => all[Math.floor(Math.random() * all.length)])
  return [...required, ...rest].sort(() => Math.random() - 0.5).join('')
}
