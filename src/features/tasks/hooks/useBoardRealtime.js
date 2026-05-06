import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribe to realtime changes on tasks + columns + comments + checklist
 * for the given project. Calls onChange() with no arguments when anything
 * relevant changes; the consumer reloads the board.
 */
export function useBoardRealtime(projectId, onChange) {
  useEffect(() => {
    if (!projectId) return
    const channel = supabase
      .channel(`board:${projectId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'tasks',         filter: `project_id=eq.${projectId}` },
        () => onChange?.()
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_columns',  filter: `project_id=eq.${projectId}` },
        () => onChange?.()
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [projectId, onChange])
}
