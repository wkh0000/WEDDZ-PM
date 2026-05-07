import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Send, Sparkles, Trash2, X } from 'lucide-react'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { useAuth } from '@/context/AuthContext'
import { useToast } from '@/context/ToastContext'
import MessageBubble from './MessageBubble'
import PendingActionCard from './PendingActionCard'
import VoiceInputButton from './VoiceInputButton'
import { sendChat } from '../api'

const STORAGE_KEY = 'weddzpm.chat.history.v1'
const MAX_HISTORY = 30

const SUGGESTIONS = [
  'How many customers do we have?',
  'List active projects',
  'Add an expense: tea 250 LKR today, category Other',
  "Set 'Retail POS' to active"
]

export default function ChatPanel({ open, onClose }) {
  const { profile } = useAuth()
  const toast = useToast()
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingAction, setPendingAction] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const scrollRef = useRef(null)

  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_HISTORY))) } catch {} }, [messages])

  // Auto-scroll
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pendingAction, sending, open])

  async function send(text) {
    const trimmed = text.trim()
    if (!trimmed || sending) return
    const next = [...messages, { role: 'user', content: trimmed }]
    setMessages(next)
    setInput('')
    setPendingAction(null)
    setSending(true)
    try {
      const data = await sendChat(next.filter(m => m.role !== 'error'))
      setMessages(arr => [...arr, { role: 'assistant', content: data.message, actions: data.actions_taken }])
      if (data.pending_action) setPendingAction(data.pending_action)
    } catch (e) {
      setMessages(arr => [...arr, { role: 'error', content: e.message || 'Assistant failed' }])
    } finally {
      setSending(false)
    }
  }

  async function confirmPending() {
    if (!pendingAction) return
    setConfirming(true)
    try {
      const data = await sendChat(messages.filter(m => m.role !== 'error'), { tool: pendingAction.tool, args: pendingAction.args })
      setMessages(arr => [...arr, { role: 'assistant', content: data.message, actions: data.actions_taken }])
      setPendingAction(data.pending_action ?? null)
    } catch (e) {
      setMessages(arr => [...arr, { role: 'error', content: e.message || 'Confirm failed' }])
    } finally {
      setConfirming(false)
    }
  }

  function rejectPending() {
    setMessages(arr => [...arr, { role: 'assistant', content: 'OK, cancelled.' }])
    setPendingAction(null)
  }

  function clearHistory() {
    if (!window.confirm('Clear the chat history?')) return
    setMessages([])
    setPendingAction(null)
    localStorage.removeItem(STORAGE_KEY)
  }

  function onSubmit(e) { e.preventDefault(); send(input) }

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="lg:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.div
            className="fixed bottom-0 right-0 z-50 w-full sm:w-[420px] sm:bottom-6 sm:right-6 sm:rounded-2xl bg-zinc-950 border border-white/10 shadow-glow flex flex-col h-[70vh] sm:h-[600px] max-h-[calc(100vh-3rem)]"
            initial={{ opacity: 0, y: 24, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.97 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            role="dialog" aria-modal="true"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 h-12 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
                  <Sparkles className="w-4 h-4 text-indigo-300" />
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-zinc-100">Assistant</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">Gemini · WEDDZ PM</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button onClick={clearHistory} className="p-1.5 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200" aria-label="Clear">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={onClose} className="p-1.5 rounded-md text-zinc-400 hover:bg-white/5 hover:text-zinc-200" aria-label="Close">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && !sending && (
                <div className="text-center py-8 space-y-3">
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 mb-1">
                    <Sparkles className="w-6 h-6 text-indigo-300" />
                  </div>
                  <div className="text-sm font-medium text-zinc-200">How can I help?</div>
                  <div className="text-xs text-zinc-500">Ask anything about customers, projects, invoices, expenses or the kanban board. Risky actions ask for confirmation.</div>
                  <div className="flex flex-col gap-1.5 pt-2">
                    {SUGGESTIONS.map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-left text-xs text-zinc-300 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-lg px-3 py-2 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => <MessageBubble key={i} msg={m} profile={profile} />)}
              {pendingAction && (
                <PendingActionCard
                  action={pendingAction}
                  onConfirm={confirmPending}
                  onReject={rejectPending}
                  busy={confirming}
                />
              )}
              {sending && (
                <div className="flex items-center gap-2 text-xs text-zinc-400 pl-8">
                  <Spinner size="xs" /> Thinking…
                </div>
              )}
            </div>

            {/* Composer */}
            <form onSubmit={onSubmit} className="shrink-0 border-t border-white/10 p-3 flex items-end gap-2">
              <VoiceInputButton
                disabled={sending}
                onTranscript={(text) => {
                  setInput(prev => (prev.trim() ? prev.replace(/\s+$/, '') + ' ' : '') + text)
                }}
                onError={(e) => {
                  if (e === 'no-speech' || e === 'aborted') return
                  toast.error(`Voice input: ${e}`)
                }}
              />
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) onSubmit(e) }}
                placeholder="Ask anything… or tap the mic"
                rows={1}
                className="flex-1 resize-none bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-indigo-400/60 max-h-32"
              />
              <Button type="submit" disabled={!input.trim()} loading={sending} size="sm" leftIcon={<Send className="w-3.5 h-3.5" />}>
                Send
              </Button>
            </form>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  )
}
