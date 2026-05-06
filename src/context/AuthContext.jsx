import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) { setProfile(null); return }
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (error) {
        console.warn('[auth] profile load failed:', error.message)
        setProfile(null)
      } else {
        setProfile(data)
      }
    } catch (e) {
      console.warn('[auth] profile load threw:', e?.message)
      setProfile(null)
    }
  }, [])

  // ---- Auth state subscription ----
  // CRITICAL: do NOT await any Supabase calls inside this callback. The
  // Supabase client holds an internal auth lock during the callback, and any
  // awaited query also tries to acquire it — that deadlock leaves the page
  // hanging on a hard refresh.
  // We just record the session here. Profile is loaded by a separate effect
  // below that watches `session`.
  useEffect(() => {
    let mounted = true

    // Pull whatever the SDK has cached without awaiting (returns immediately
    // from localStorage; no auth lock involved if listener isn't running yet).
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mounted) return
        setSession(session)
        setLoading(false)
      })
      .catch(() => { if (mounted) setLoading(false) })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      // synchronous: just record. NO awaiting Supabase calls here.
      if (!mounted) return
      setSession(newSession)
      setLoading(false)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  // ---- Profile loader ----
  // Runs when session changes. Awaits are safe here because we're outside
  // the auth lock.
  useEffect(() => {
    if (session?.user) {
      loadProfile(session.user.id)
    } else {
      setProfile(null)
    }
  }, [session, loadProfile])

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }, [])

  const signUp = useCallback(async (email, password, fullName) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName ?? '' } }
    })
    if (error) throw error
    return data
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const sendPasswordReset = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`
    })
    if (error) throw error
  }, [])

  const updateOwnProfile = useCallback(async (updates) => {
    if (!profile) return
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }, [profile])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    isSuperAdmin: profile?.role === 'super_admin',
    isAuthed: !!session?.user,
    loading,
    signIn,
    signUp,
    signOut,
    sendPasswordReset,
    updateOwnProfile,
    refreshProfile
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
