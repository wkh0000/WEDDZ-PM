import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X } from 'lucide-react'
import ChatPanel from './ChatPanel'
import { useAuth } from '@/context/AuthContext'

export default function ChatLauncher() {
  const { isAuthed, profile } = useAuth()
  const [open, setOpen] = useState(false)
  if (!isAuthed || !profile?.active) return null
  return (
    <>
      <AnimatePresence>
        {!open && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 12 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(true)}
            className="fixed bottom-5 right-5 z-30 group inline-flex items-center gap-2 pl-3 pr-4 h-12 rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-glow border border-indigo-400/40 hover:from-indigo-400 hover:to-indigo-500 transition-colors"
            aria-label="Open assistant"
          >
            <span className="relative inline-flex items-center justify-center w-7 h-7 rounded-full bg-white/15">
              <Sparkles className="w-4 h-4" />
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-indigo-600 animate-pulse-soft" />
            </span>
            <span className="text-sm font-medium hidden sm:inline">Ask</span>
          </motion.button>
        )}
      </AnimatePresence>
      <ChatPanel open={open} onClose={() => setOpen(false)} />
    </>
  )
}
