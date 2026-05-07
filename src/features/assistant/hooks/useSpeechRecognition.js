import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Hook over the browser Web Speech API (Chrome / Edge / Safari support
 * via the SpeechRecognition global, with the webkitSpeechRecognition
 * fallback for older Chrome).
 *
 * Returns:
 *   supported   — boolean, false on Firefox / older browsers
 *   listening   — boolean, true while recording
 *   error       — string | null
 *   start(opts) — begin recording. opts: { lang?, interimResults?, onFinal(text), onInterim(text) }
 *   stop()      — stop manually (also stops automatically on silence)
 */
export function useSpeechRecognition() {
  const [listening, setListening] = useState(false)
  const [error, setError] = useState(null)
  const recogRef = useRef(null)
  const handlersRef = useRef({ onFinal: null, onInterim: null })

  const supported = typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  useEffect(() => () => {
    try { recogRef.current?.stop() } catch {}
  }, [])

  const start = useCallback((opts = {}) => {
    if (!supported) { setError('Speech recognition not supported in this browser'); return }
    try {
      const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition
      const r = new Ctor()
      r.lang = opts.lang ?? navigator.language ?? 'en-US'
      r.continuous = false
      r.interimResults = !!opts.interimResults
      r.maxAlternatives = 1
      handlersRef.current = { onFinal: opts.onFinal, onInterim: opts.onInterim }

      r.onstart  = () => { setError(null); setListening(true) }
      r.onerror  = (e) => { setError(e.error || 'Speech error'); setListening(false) }
      r.onend    = () => setListening(false)
      r.onresult = (e) => {
        let finalText = ''
        let interimText = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalText += r[0].transcript
          else interimText += r[0].transcript
        }
        if (finalText) handlersRef.current.onFinal?.(finalText.trim())
        if (interimText) handlersRef.current.onInterim?.(interimText.trim())
      }

      recogRef.current = r
      r.start()
    } catch (e) {
      setError(e.message ?? 'Failed to start')
      setListening(false)
    }
  }, [supported])

  const stop = useCallback(() => {
    try { recogRef.current?.stop() } catch {}
  }, [])

  return { supported, listening, error, start, stop }
}
