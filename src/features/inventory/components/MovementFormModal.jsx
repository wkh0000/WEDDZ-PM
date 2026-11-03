import { useEffect, useMemo, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { useToast } from '@/context/ToastContext'
import { postMovements } from '../api'
import { MOVEMENT_TYPES, onHand, validateMoves } from '../lib/stock'
import { useInventory } from '../pages/InventoryLayout'

const today = () => new Date().toISOString().slice(0, 10)

export default function MovementFormModal({ open, onClose, initialType = 'PURCHASE', initialProductId = '', onSaved }) {
  const toast = useToast()
  const { products, locations, stock, can, reload } = useInventory()
  const [type, setType] = useState(initialType)
  const [productId, setProductId] = useState(initialProductId)
  const [qty, setQty] = useState('1')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [direction, setDirection] = useState('add')
  const [date, setDate] = useState(today())
  const [reason, setReason] = useState('')
  const [reference, setReference] = useState('')
  const [unitCost, setUnitCost] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setType(initialType); setProductId(initialProductId); setQty('1'); setReason(''); setReference(''); setUnitCost('')
      setDate(today()); setDirection('add')
    }
  }, [open, initialType, initialProductId])

  const allowedTypes = Object.entries(MOVEMENT_TYPES).filter(([k, t]) =>
    k !== 'DELIVERED_TO_SITE' && (!t.admin || can.admin) && (!t.manage || can.manage))

  const office = locations.find(l => l.kind === 'office' && l.active)
  const vehicles = locations.filter(l => l.kind === 'vehicle' && l.active)
  const stores = locations.filter(l => (l.kind === 'office' || l.kind === 'vehicle') && l.active)

  // sensible defaults for from/to per type
  useEffect(() => {
    if (!open) return
    if (type === 'PURCHASE' || type === 'OPENING') { setFromId(''); setToId(office?.id ?? '') }
    if (type === 'TRANSFER_TO_VEHICLE') { setFromId(office?.id ?? ''); setToId(vehicles[0]?.id ?? '') }
    if (type === 'RETURN_TO_OFFICE') { setFromId(vehicles[0]?.id ?? ''); setToId(office?.id ?? '') }
    if (type === 'DAMAGED') { setFromId(office?.id ?? ''); setToId('') }
    if (type === 'ADJUSTMENT') { setFromId(''); setToId(office?.id ?? '') }
  }, [type, open]) // eslint-disable-line react-hooks/exhaustive-deps

  const stockProducts = products.filter(p => p.is_stock && p.active)
  const move = useMemo(() => {
    const n = parseInt(qty, 10)
    if (type === 'ADJUSTMENT') {
      const loc = toId || fromId
      return direction === 'add'
        ? { from_location_id: null, to_location_id: loc }
        : { from_location_id: loc, to_location_id: null, n }
    }
    return { from_location_id: fromId || null, to_location_id: toId || null, n }
  }, [type, fromId, toId, direction, qty])

  const n = parseInt(qty, 10)
  const problems = productId && n > 0
    ? validateMoves(stock, [{ product_id: productId, qty: n, from_location_id: move.from_location_id, to_location_id: move.to_location_id }], { products, locations })
    : []
  const needsReason = MOVEMENT_TYPES[type]?.reason
  const ready = productId && n > 0 && !problems.length && (!needsReason || reason.trim()) &&
    (move.from_location_id || move.to_location_id)

  async function submit(e) {
    e.preventDefault()
    if (!ready) return
    setBusy(true)
    try {
      await postMovements([{
        moved_on: date, product_id: productId, qty: n, type,
        from_location_id: move.from_location_id, to_location_id: move.to_location_id,
        reason: needsReason ? reason.trim() : null,
        note: !needsReason && reason.trim() ? reason.trim() : null,
        reference: reference.trim() || null,
        unit_cost: type === 'PURCHASE' && unitCost !== '' ? Number(unitCost) : null
      }])
      toast.success(`${MOVEMENT_TYPES[type].label} recorded`)
      await reload()
      onSaved?.()
      onClose()
    } catch (err) {
      toast.error(err.message || 'Could not record the movement')
    } finally {
      setBusy(false)
    }
  }

  const locOptions = list => [{ value: '', label: 'Choose…' }, ...list.map(l => ({ value: l.id, label: l.name }))]
  const product = products.find(p => p.id === productId)

  return (
    <Modal open={open} onClose={onClose} title="Record stock movement" width="md"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={busy} disabled={!ready}>Record</Button>
      </>}>
      <form onSubmit={submit} className="space-y-4">
        <Select label="Type" value={type} onChange={e => setType(e.target.value)}
          options={allowedTypes.map(([k, t]) => ({ value: k, label: t.label }))} />
        <Select label="Product" value={productId} onChange={e => setProductId(e.target.value)}
          options={[{ value: '', label: 'Choose a product…' }, ...stockProducts.map(p => ({ value: p.id, label: p.name }))]} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity" type="number" min="1" step="1" value={qty} onChange={e => setQty(e.target.value)} />
          <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        {type === 'ADJUSTMENT' ? (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Location" value={toId || fromId} onChange={e => { setToId(e.target.value); setFromId(e.target.value) }} options={locOptions(stores)} />
            <Select label="Direction" value={direction} onChange={e => setDirection(e.target.value)}
              options={[{ value: 'add', label: 'Add to stock' }, { value: 'remove', label: 'Remove from stock' }]} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {MOVEMENT_TYPES[type].from?.length > 0 && (
              <Select label="From" value={fromId} onChange={e => setFromId(e.target.value)}
                options={locOptions(locations.filter(l => l.active && MOVEMENT_TYPES[type].from.includes(l.kind)))} />
            )}
            {MOVEMENT_TYPES[type].to?.length > 0 && (
              <Select label="To" value={toId} onChange={e => setToId(e.target.value)}
                options={locOptions(locations.filter(l => l.active && MOVEMENT_TYPES[type].to.includes(l.kind)))} />
            )}
          </div>
        )}

        {product && move.from_location_id && (
          <p className="text-xs text-zinc-500">
            Available at {locations.find(l => l.id === move.from_location_id)?.name}: <span className="text-zinc-200 font-medium">{onHand(stock, productId, move.from_location_id)}</span>
          </p>
        )}

        {type === 'PURCHASE' && (
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unit cost (optional)" type="number" min="0" step="0.01" value={unitCost} onChange={e => setUnitCost(e.target.value)} />
            <Input label="Supplier / bill ref (optional)" value={reference} onChange={e => setReference(e.target.value)} />
          </div>
        )}
        <Input label={needsReason ? 'Reason (required)' : 'Note (optional)'} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={needsReason ? 'e.g. Count correction, cracked screen' : ''} />

        {problems.map(p => <p key={p} className="text-sm text-rose-300">{p}</p>)}
      </form>
    </Modal>
  )
}
