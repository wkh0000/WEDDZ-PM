import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

const MENU_W = 192 // 12rem

/**
 * Dropdown menu rendered in a portal with fixed positioning, so it never
 * gets clipped by a parent's `overflow-hidden` / `overflow-x-auto`
 * (tables, cards) — the previous absolute-positioned version was cut off
 * at section edges. Background is solid (not glass) for clear contrast
 * over busy table rows. Flips above the trigger when there's no room
 * below, and clamps to the viewport horizontally.
 */
export default function DropdownMenu({ trigger, items, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const menuRef = useRef(null)

  function computePosition() {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const gap = 6
    const menuH = menuRef.current?.offsetHeight ?? 0
    let top = r.bottom + gap
    if (menuH && top + menuH > window.innerHeight - 8) {
      top = Math.max(8, r.top - gap - menuH) // flip above
    }
    let left = align === 'right' ? r.right - MENU_W : r.left
    left = Math.min(Math.max(8, left), window.innerWidth - MENU_W - 8)
    setCoords({ top, left })
  }

  // Position before paint so there's no flash at (0,0).
  useLayoutEffect(() => {
    if (open) computePosition()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    function onClick(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false) }
    function reposition() { computePosition() }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <>
      <span ref={triggerRef} onClick={() => setOpen(o => !o)} className="inline-flex">
        {trigger}
      </span>
      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_W }}
              className="z-[60] rounded-xl border border-white/15 bg-zinc-900 shadow-2xl ring-1 ring-black/50 py-1"
            >
              {items.map((item, i) => {
                if (item.separator) {
                  return <div key={i} className="my-1 border-t border-white/10" />
                }
                const Icon = item.icon
                return (
                  <button
                    key={i}
                    onClick={() => { item.onClick?.(); setOpen(false) }}
                    className={cn(
                      'w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors',
                      item.danger
                        ? 'text-rose-300 hover:bg-rose-500/15'
                        : 'text-zinc-200 hover:bg-white/10'
                    )}
                    disabled={item.disabled}
                  >
                    {Icon && <Icon className="w-4 h-4 shrink-0" />}
                    <span className="flex-1">{item.label}</span>
                  </button>
                )
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
