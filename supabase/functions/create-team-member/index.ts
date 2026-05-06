// supabase/functions/create-team-member/index.ts
//
// Edge Function — only super_admin callers may invoke.
// Creates a Supabase auth user with email_confirm:true (no verification email)
// and updates their profile row to the requested role + full_name.
//
// Required env (set via `supabase secrets set`):
//   SUPABASE_URL                  (auto)
//   SUPABASE_ANON_KEY             (auto)
//   SUPABASE_SERVICE_ROLE_KEY     (manual — see process/00-MASTER-PLAN.md § J)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST')   return json({ error: 'method not allowed' }, 405)

  let body: { email?: string; full_name?: string; password?: string; role?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const { email, full_name, password, role } = body
  if (!email || !password) return json({ error: 'email and password are required' }, 400)
  if (password.length < 8)  return json({ error: 'password must be at least 8 characters' }, 400)
  const targetRole = role === 'super_admin' ? 'super_admin' : 'member'

  const supabaseUrl  = Deno.env.get('SUPABASE_URL')
  const anonKey      = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: 'server misconfigured: missing env' }, 500)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  // 1. Verify caller is an active super_admin
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } }
  })

  const { data: userData, error: userErr } = await userClient.auth.getUser()
  if (userErr || !userData?.user) return json({ error: 'unauthorized' }, 401)

  const { data: profile, error: profErr } = await userClient
    .from('profiles')
    .select('role, active')
    .eq('id', userData.user.id)
    .single()

  if (profErr || !profile) return json({ error: 'profile not found' }, 403)
  if (profile.role !== 'super_admin' || !profile.active) return json({ error: 'forbidden' }, 403)

  // 2. Create the user using the admin client
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name ?? '' }
  })

  if (createErr || !created?.user) {
    return json({ error: createErr?.message ?? 'failed to create user' }, 400)
  }

  // 3. Update the profile created by handle_new_user trigger
  const { error: updateErr } = await adminClient
    .from('profiles')
    .update({ full_name: full_name ?? '', role: targetRole })
    .eq('id', created.user.id)

  if (updateErr) {
    // Best-effort rollback: delete the auth user
    await adminClient.auth.admin.deleteUser(created.user.id)
    return json({ error: `profile update failed: ${updateErr.message}` }, 500)
  }

  return json({
    user: {
      id: created.user.id,
      email: created.user.email,
      full_name: full_name ?? '',
      role: targetRole
    }
  })
})
