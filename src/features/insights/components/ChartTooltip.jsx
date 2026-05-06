export default function ChartTooltip({ active, payload, label, valueFormatter = (v) => v }) {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="glass-strong rounded-xl border border-white/15 px-3 py-2 shadow-glow text-xs">
      {label && <div className="text-zinc-400 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-zinc-200">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color || p.fill }} />
          <span className="text-zinc-400">{p.name}:</span>
          <span className="font-medium tabular-nums">{valueFormatter(p.value)}</span>
        </div>
      ))}
    </div>
  )
}
