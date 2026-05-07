import { supabase } from '@/lib/supabase'

/**
 * Send a turn to the chat-assistant Edge Function.
 *
 * @param {Array<{role:'user'|'assistant', content:string}>} messages
 * @param {{tool:string, args:any} | null} confirmedAction  set when the user confirms a pending action
 * @returns {Promise<{message:string, actions_taken:any[], pending_action:any|null}>}
 */
export async function sendChat(messages, confirmedAction = null) {
  const { data, error } = await supabase.functions.invoke('chat-assistant', {
    body: { messages, confirmed_action: confirmedAction }
  })
  if (error) {
    const body = error.context?.body
    if (body && typeof body === 'object' && body.error) throw new Error(body.error)
    throw error
  }
  if (data?.error) throw new Error(data.error)
  return data
}
