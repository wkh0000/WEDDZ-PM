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

  useEffect(() => {
    // Use onAuthStateChange exclusively. Supabase fires `INITIAL_SESSION`
    // with the restored session on subscribe — calling getSession() in
    // parallel can deadlock the internal auth lock and hang loading on
    // hard refresh.
    let mounted = true
    let firstFired = false

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!mounted) return
      setSession(newSession)
      if (newSession?.user) {
        await loadProfile(newSession.user.id)
      } else {
        setProfile(null)
      }
      firstFired = true
      setLoading(false)
    })

    // Safety: if INITIAL_SESSION never fires (e.g. SDK quirk), unblock the UI.
    const safety = setTimeout(() => {
      if (mounted && !firstFired) {
        console.warn('[auth] INITIAL_SESSION did not fire within 5s; releasing loading state')
        setLoading(false)
      }
    }, 5000)

    return () => {
      mounted = false
      clearTimeout(safety)
      subscription.unsubscribe()
    }
    // loadProfile is stable (useCallback with []) but include it for lint
  }, [loadProfile])

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
