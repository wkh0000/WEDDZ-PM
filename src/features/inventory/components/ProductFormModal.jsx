import { useEffect, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Textarea from '@/components/ui/Textarea'
import { useToast } from '@/context/ToastContext'
import { saveProduct } from '../api'

const EMPTY = {
  name: '', sku: '', category: 'Hardware', brand_model: '', unit: 'pcs', price: '', kind: 'hardware',
  is_stock: true, is_free: false, track_serials: false, warranty_months: '', warranty_label: 'warranty',
  low_stock_threshold: '0', invoice_detail: '', dn_name: '', dn_detail: '', components: '', active: true, sort_order: '100'
}

export function Check({ label, checked, onChange, hint }) {
  return (
    <label className="flex items-start gap-2.5 text-sm text-zinc-200 cursor-pointer">
      <input type="checkbox" className="mt-0.5 accent-indigo-500" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span>{label}{hint && <span className="block text-xs text-zinc-500">{hint}</span>}</span>
    </label>
  )
}

export default function ProductFormModal({ open, onClose, product, onSaved }) {
  const toast = useToast()
  const [f, setF] = useState(EMPTY)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setF(s => ({ ...s, [k]: v }))

  useEffect(() => {
    if (!open) return
    setF(product ? {
      ...EMPTY, ...product,
      price: product.price ?? '', warranty_months: product.warranty_months ?? '', warranty_label: product.warranty_label ?? 'warranty',
      low_stock_threshold: String(product.low_stock_threshold ?? 0), sort_order: String(product.sort_order ?? 100),
      sku: product.sku ?? '', brand_model: product.brand_model ?? '', invoice_detail: product.invoice_detail ?? '',
      dn_name: product.dn_name ?? '', dn_detail: product.dn_detail ?? '',
      components: (product.dn_components ?? []).map(c => c.name).join('\n')
    } : EMPTY)
  }, [open, product])

  async function submit(e) {
    e.preventDefault()
    if (!f.name.trim()) { toast.error('Name is required'); return }
    setBusy(true)
    try {
      const software = f.kind === 'software'
      await saveProduct({
        ...(product ? { id: product.id } : {}),
        name: f.name.trim(), sku: f.sku.trim() || null, category: f.category.trim() || 'Hardware',
        brand_model: f.brand_model.trim() || null, unit: f.unit, kind: f.kind,
        price: f.is_free ? 0 : (f.price === '' ? null : Number(f.price)),
        is_stock: software ? false : f.is_stock, is_free: f.is_free, track_serials: !software && f.track_serials,
        warranty_months: f.warranty_months === '' ? null : parseInt(f.warranty_months, 10),
        warranty_label: f.warranty_months === '' ? null : f.warranty_label,
        low_stock_threshold: parseInt(f.low_stock_threshold, 10) || 0,
        invoice_detail: f.invoice_detail.trim() || null, dn_name: f.dn_name.trim() || null, dn_detail: f.dn_detail.trim() || null,
        dn_components: f.components.split('\n').map(s => s.trim()).filter(Boolean).map(name => ({ name })),
        active: f.active, sort_order: parseInt(f.sort_order, 10) || 100
      })
      toast.success(product ? 'Product updated' : 'Product added')
      onSaved?.(); onClose()
    } catch (err) {
      toast.error(err.message || 'Could not save the product')
    } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} width="lg" title={product ? 'Edit product' : 'New product'}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Save</Button></>}>
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name (as printed on invoices)" value={f.name} onChange={e => set('name', e.target.value)} />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="SKU" value={f.sku} onChange={e => set('sku', e.target.value)} />
          <Input label="Category" value={f.category} onChange={e => set('category', e.target.value)} />
          <Select label="Type" value={f.kind} onChange={e => set('kind', e.target.value)} options={[{ value: 'hardware', label: 'Hardware' }, { value: 'software', label: 'Software / service' }]} />
          <Select label="Unit" value={f.unit} onChange={e => set('unit', e.target.value)} options={['pcs', 'set', 'roll', 'm'].map(u => ({ value: u, label: u }))} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Price (Rs.)" type="number" min="0" step="0.01" value={f.price} disabled={f.is_free} onChange={e => set('price', e.target.value)} hint="Blank = not priced yet" />
          <Input label="Brand / model" value={f.brand_model} onChange={e => set('brand_model', e.target.value)} />
          <Input label="Cover (months)" type="number" min="0" value={f.warranty_months} onChange={e => set('warranty_months', e.target.value)} />
          <Select label="Cover type" value={f.warranty_label} onChange={e => set('warranty_label', e.target.value)} options={[{ value: 'warranty', label: 'Warranty' }, { value: 'guarantee', label: 'Guarantee' }]} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Low-stock warning below" type="number" min="0" value={f.low_stock_threshold} onChange={e => set('low_stock_threshold', e.target.value)} />
          <Input label="Sort order" type="number" value={f.sort_order} onChange={e => set('sort_order', e.target.value)} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Check label="Stock item" hint="Counted in the office/vehicle ledger" checked={f.kind !== 'software' && f.is_stock} onChange={v => set('is_stock', v)} />
          <Check label="Free item" hint="Prints “Free” on invoices (e.g. ID cards)" checked={f.is_free} onChange={v => set('is_free', v)} />
          <Check label="Track serial numbers" checked={f.track_serials} onChange={v => set('track_serials', v)} />
          <Check label="Active" checked={f.active} onChange={v => set('active', v)} />
        </div>
        <Input label="Invoice sub-line (optional)" value={f.invoice_detail} onChange={e => set('invoice_detail', e.target.value)} placeholder="e.g. With tempered glass screen protector, pouch and charging dock" />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Delivery note name" value={f.dn_name} onChange={e => set('dn_name', e.target.value)} placeholder="Defaults to the name" />
          <Input label="Delivery note sub-line" value={f.dn_detail} onChange={e => set('dn_detail', e.target.value)} />
        </div>
        <Textarea label="Set contents — one per line (listed under it on delivery notes)" rows={3} value={f.components} onChange={e => set('components', e.target.value)} />
      </form>
    </Modal>
  )
}
