import { Mic, MicOff } from 'lucide-react'
import { motion } from 'framer-motion'
import { useSpeechRecognition } from '../hooks/useSpeechRecognition'
import { cn } from '@/lib/cn'

/**
 * Mic button beside the chat composer. While listening:
 *  - The button glows red and gently pulses.
 *  - Each finalized chunk of speech is appended to the input via onTranscript.
 *  - Auto-stops on a natural pause (default Web Speech behaviour with continuous=false).
 *  - Clicking stops manually.
 *
 * Hidden in browsers without SpeechRecognition (Firefox).
 */
export default function VoiceInputButton({ onTranscript, onError, disabled }) {
  const { supported, listening, error, start, stop } = useSpeechRecognition()

  if (!supported) return null

  function toggle() {
    if (listening) { stop(); return }
    start({
      lang: navigator.language || 'en-US',
      interimResults: false,
      onFinal: (text) => onTranscript?.(text),
      onError: (e) => onError?.(e)
    })
  }

  // Surface the error once (caller can swallow)
  if (error && onError) onError(error)

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      title={listening ? 'Stop recording' : 'Voice input'}
      aria-label={listening ? 'Stop recording' : 'Start voice input'}
      className={cn(
        'shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg border transition-colors relative',
        listening
          ? 'bg-rose-500/20 border-rose-500/40 text-rose-200'
          : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 text-zinc-400 hover:text-zinc-200',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {listening ? (
        <>
          <motion.span
            className="absolute inset-0 rounded-lg bg-rose-500/30"
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
          />
          <MicOff className="w-4 h-4 relative" />
        </>
      ) : (
        <Mic className="w-4 h-4" />
      )}
    </button>
  )
}
