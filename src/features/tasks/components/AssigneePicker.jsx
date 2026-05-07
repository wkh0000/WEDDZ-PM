import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, Plus, X } from 'lucide-react'
import Avatar from '@/components/ui/Avatar'
import AvatarGroup from '@/components/ui/AvatarGroup'
import { cn } from '@/lib/cn'

/**
 * Multi-select assignee picker.
 *
 * Props
 *   value     — array of profile UUIDs currently selected
 *   onChange  — (uuids: string[]) => void
 *   profiles  — array of { id, full_name, email, avatar_url }
 *   label     — optional label rendered above the field
 *   compact   — small chip variant for the inline quick-add form
 *   disabled  — disables the trigger
 */
export default function AssigneePicker({ value = [], onChange, profiles = [], label, compact = false, disabled = false }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // selected profiles in the order they were chosen — preserves the
  // "primary" assignee position so the drawer / card / RPCs all agree.
  const selected = value
    .map(id => profiles.find(p => p.id === id))
    .filter(Boolean)

  function toggle(id) {
    if (value.includes(id)) onChange(value.filter(x => x !== id))
    else onChange([...value, id])
  }

  function clear(e) {
    e?.stopPropagation()
    onChange([])
  }

  // close on outside click
  useEffect(() => {
    if (!open) return
    function onDocClick(e) {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  if (compact) {
    // Inline mini-picker for the column quick-add form.
    return (
      <div ref={wrapRef} className="relative inline-block">
        <button
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className="bg-white/[0.05] border border-white/10 rounded px-1.5 h-6 text-[11px] text-zinc-200 inline-flex items-center gap-1 hover:border-white/25"
        >
          {selected.length === 0 && <span className="text-zinc-400">Unassigned</span>}
          {selected.length > 0 && <AvatarGroup items={selected} max={3} size="xs" ring="ring-zinc-900" />}
          <ChevronDown className="w-3 h-3 text-zinc-400" />
        </button>
        {open && (
          <div className="absolute z-30 top-7 left-0 min-w-[200px] rounded-lg border border-white/10 bg-zinc-900 shadow-xl py-1">
            <PickerList profiles={profiles} value={value} toggle={toggle} />
            {value.length > 0 && (
              <button onClick={clear} className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-400 hover:bg-white/5 border-t border-white/10 flex items-center gap-1.5">
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  // Full field for the detail drawer. Mirrors the look of <Select>.
  return (
    <div ref={wrapRef} className="space-y-1.5">
      {label && (
        <label className="block text-xs font-medium text-zinc-300 uppercase tracking-wide">{label}</label>
      )}
      <div className={cn(
        'relative rounded-xl border transition-colors',
        'bg-white/[0.04] hover:bg-white/[0.06] focus-within:bg-white/[0.06]',
        'border-white/10 focus-within:border-indigo-400/60'
      )}>
        <button
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className="w-full flex items-center gap-2 px-3 py-2.5 pr-9 text-sm text-zinc-100 min-h-[42px]"
        >
          {selected.length === 0 ? (
            <span className="text-zinc-500">Unassigned</span>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {selected.map(p => (
                <span
                  key={p.id}
                  className="inline-flex items-center gap-1 pl-0.5 pr-1.5 h-6 rounded-full bg-white/[0.06] border border-white/10 text-[11px]"
                  onClick={(e) => { e.stopPropagation(); toggle(p.id) }}
                >
                  <Avatar size="xs" name={p.full_name || p.email} src={p.avatar_url} className="!h-5 !w-5 !text-[9px]" />
                  <span className="text-zinc-200">{p.full_name || p.email}</span>
                  <X className="w-3 h-3 text-zinc-400 hover:text-rose-300" />
                </span>
              ))}
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Plus className="w-3 h-3" />
              </span>
            </div>
          )}
        </button>
        <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-zinc-400 pointer-events-none" />
      </div>

      {open && (
        <div className="relative">
          <div className="absolute z-30 top-1 left-0 right-0 max-h-72 overflow-auto rounded-lg border border-white/10 bg-zinc-900 shadow-xl py-1">
            <PickerList profiles={profiles} value={value} toggle={toggle} />
            {profiles.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-500">No teammates available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function PickerList({ profiles, value, toggle }) {
  return profiles.map(p => {
    const active = value.includes(p.id)
    return (
      <button
        key={p.id}
        type="button"
        onClick={() => toggle(p.id)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-200 hover:bg-white/5"
      >
        <Avatar size="xs" name={p.full_name || p.email} src={p.avatar_url} />
        <span className="flex-1 text-left truncate">{p.full_name || p.email}</span>
        {active && <Check className="w-3.5 h-3.5 text-indigo-300" />}
      </button>
    )
  })
}
