import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to realtime changes on tasks + columns + assignees for the
 * given project. Calls onChange() with no arguments when anything
 * relevant changes; the consumer reloads the board.
 *
 * Note on `task_assignees`: the join table doesn't carry `project_id`,
 * so we can't filter server-side. We accept the small over-fetch
 * (firing on any assignee change for any project) — it keeps the
 * subscription simple and the reload is cheap (one query per project).
 */
export function useBoardRealtime(projectId, onChange) {
  useEffect(() => {
    if (!projectId) return
    const channel = supabase
      .channel(`board:${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks',          filter: `project_id=eq.${projectId}` },
        () => onChange?.()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_columns',   filter: `project_id=eq.${projectId}` },
        () => onChange?.()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_assignees' },
        () => onChange?.()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, onChange])
}
