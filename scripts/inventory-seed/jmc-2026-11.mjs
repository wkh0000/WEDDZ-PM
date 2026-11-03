// JMC Wines Group — inventory seed (state as of 3 Nov 2026).
// Single source of truth for build-sql.mjs and the view-model tests.
// Assumptions are marked ASSUMED; change them here and re-generate.
import { createHash } from 'node:crypto'

export const uid = key => {
  const h = createHash('md5').update(`weddz-inv:${key}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

export const client = {
  id: uid('client:jmc'),
  doc_ref: '2026-085',
  quotation_no: 'WIT-Q-2026-085-R1',
  contact_name: 'Mr. Jayantha Munaweera', // PDFs say "Munweera"; PM + client's own system say "Munaweera"
  company: 'JMC Wines Group',
  mobile: '+94 77 784 3334',
  project_title: 'Liquor Store Management System',
  notes: 'Multi-Branch Edition: main branch + 10 outlets (Quotation WIT-Q-2026-085-R1). Year 1 software fees Rs. 1,900,000.00; 40% advance Rs. 760,000.00; balance invoiced as each outlet goes live, per the Project Agreement.',
  customer_lookup: "name ilike 'Jayantha Mun%'",
  project_lookup: "name = 'Jayantha Munaweera Chain'"
}

const tabletParts = [
  { name: 'Tablet tempered glass screen protector' },
  { name: 'Tablet pouch / protective case' },
  { name: 'Tablet charging dock with power adapter' }
]

// sku → product. price null = not priced yet (ask before invoicing).
export const products = [
  { sku: 'SW-LSMS-OUTLET', name: 'Liquor Store Management System — outlet software', invoice_detail: 'Outlet licence, setup, data loading, staff training and go-live support', category: 'Software', kind: 'software', is_stock: false, price: 150000, unit: 'pcs' },
  { sku: 'POS-I5-5G', name: 'POS terminal — Intel Core i5, 5th generation', dn_name: 'POS terminal', dn_detail: 'All-in-one counter terminal', category: 'POS hardware', brand_model: 'All-in-one, Intel Core i5 (5th gen)', price: 120000, warranty_months: 12, warranty_label: 'warranty', track_serials: true, low_stock_threshold: 2 },
  { sku: 'POS-I5-3G', name: 'POS terminal — Intel Core i5, 3rd generation', dn_name: 'POS terminal', dn_detail: 'Counter terminal', category: 'POS hardware', brand_model: 'Intel Core i5 (3rd gen)', price: 110000, warranty_months: 12, warranty_label: 'warranty', track_serials: true },
  { sku: 'SCN-GT8801D', name: 'Desktop barcode scanner — hands-free', dn_name: '2D image desktop barcode scanner', dn_detail: 'Hands-free, sits on the counter', category: 'POS hardware', brand_model: 'GT-8801D (2D image)', price: 8400, warranty_months: 12, warranty_label: 'warranty', low_stock_threshold: 2 },
  { sku: 'PRN-XPRINTER', name: 'Xprinter thermal receipt printer', category: 'POS hardware', brand_model: 'Xprinter', price: 14700, warranty_months: 12, warranty_label: 'warranty', low_stock_threshold: 2 },
  { sku: 'ROLL-POS', name: 'POS printer paper roll', category: 'Consumables', unit: 'roll', price: 230, low_stock_threshold: 5 },
  { sku: 'RFID-R20D', name: 'RFID card reader', dn_name: 'RFID card reader (R20D-USB)', dn_detail: 'For staff ID card login', category: 'POS hardware', brand_model: 'R20D-USB', price: 5400, warranty_months: 12, warranty_label: 'warranty', low_stock_threshold: 2 },
  { sku: 'TAB-A11-SET', name: 'Samsung Galaxy Tab A11+ 5G set', invoice_detail: 'With tempered glass screen protector, pouch and charging dock with power adapter', dn_name: 'Samsung Galaxy Tab A11+ 5G', dn_detail: 'Manager tablet', dn_components: tabletParts, category: 'Tablets', brand_model: 'Samsung Galaxy Tab A11+ 5G (6 GB / 128 GB)', unit: 'set', price: 87000, warranty_months: 12, warranty_label: 'guarantee', track_serials: true, low_stock_threshold: 1 },
  { sku: 'TAB-DOCK', name: 'Tablet charging dock with power adapter (spare)', dn_name: 'Tablet charging dock with power adapter', category: 'Tablets', price: null },
  { sku: 'MOUSE-M120', name: 'Jertech M120 wired mouse', category: 'Peripherals', brand_model: 'Jertech M120', price: 830, low_stock_threshold: 2 },
  { sku: 'KBD-Z10', name: 'Z10 wired keyboard', category: 'Peripherals', brand_model: 'Z10 (BANK)', price: 1350, low_stock_threshold: 2 },
  { sku: 'SOCKET-DEEN', name: 'DEEN power extension socket', category: 'Peripherals', brand_model: 'DEEN', price: 1860, low_stock_threshold: 2 },
  { sku: 'NET-1.5M', name: 'Network cable — 1.5 m', category: 'Cables', price: null, low_stock_threshold: 2 },
  { sku: 'NET-3M', name: 'Network cable — 3 m', category: 'Cables', price: null, low_stock_threshold: 2 },
  { sku: 'WIFI-ADAPTER', name: 'Wi-Fi adapter', category: 'Peripherals', price: null, low_stock_threshold: 2 },
  { sku: 'HDMI', name: 'HDMI cable', category: 'Cables', price: null, low_stock_threshold: 2 },
  { sku: 'ID-LANYARD', name: 'Staff ID cards with lanyards', category: 'Staff ID', is_stock: false, is_free: true, price: 0 },
  { sku: 'ID-CARD', name: 'Staff ID cards', category: 'Staff ID', is_stock: false, is_free: true, price: 0 },
  { sku: 'LANYARD', name: 'Lanyard', category: 'Staff ID', is_stock: false, is_free: true, price: 0 }
].map((p, i) => ({
  id: uid(`product:${p.sku}`), kind: 'hardware', is_stock: true, is_free: false, track_serials: false,
  unit: 'pcs', low_stock_threshold: 0, dn_components: [], sort_order: (i + 1) * 10, ...p
}))
export const P = Object.fromEntries(products.map(p => [p.sku, p]))

export const office = { id: uid('loc:office'), kind: 'office', name: 'Office', address: 'No. 339/1/H, Kurunegala Road, Kandy', sort_order: 1 }
export const van = { id: uid('loc:van1'), kind: 'vehicle', name: 'Van 1', sort_order: 2 } // ASSUMED: one vehicle
const site = (key, name, address, manager_name, manager_mobile, extra = {}) =>
  ({ id: uid(`site:${key}`), kind: 'site', client_id: client.id, name, address, manager_name, manager_mobile, is_outlet: true, ...extra })
export const sites = {
  tham: site('tham', 'Thambapanni Wine Stores', 'Godagama', 'Mr. Nelson Jayathilaka', '077 287 4241', { sort_order: 10 }),
  ncl: site('ncl', 'New City Light Wine Stores', 'No. 183 A, Negombo Road, Puwakgas Junction, Kurunegala', 'Mr. Nalinda Rambukwella', '077 939 9689', { sort_order: 20 }),
  royal: site('royal', 'Royal Wine Stores', 'No. 658, Dambulla Road, Kiriwawla, Thorayaya', 'Mr. Kumara Ekanayake', '077 912 2011', { sort_order: 30 }),
  kumb: site('kumb', 'Kumbukgete Wine Stores', 'No. 05, Disaneggama, Moragollagama Road, Kumbukgete', 'Mr. Prasanna Sanjeewa', '077 555 7742', { sort_order: 40 }),
  thel: site('thel', 'Theldeniya Wine Stores', 'No. 62/1, Mahiyangana Road, Wilamuna, Theldeniya', 'Mr. Nidahas Bandara', '072 343 0348', { sort_order: 50 }),
  thal: site('thal', 'Thalathuoya Wine Stores', 'No. 02, Koongas Junction, Imbulgasdeniya', 'Mr. V. Subhakaran', '071 459 3635', { sort_order: 60 }),
  owner: site('owner', 'Mr. Jayantha Munaweera (owner)', null, 'Mr. Jayantha Munaweera', '+94 77 784 3334', { is_outlet: false, sort_order: 90 })
}
export const locations = [office, van, ...Object.values(sites)]

// ---------- delivery notes ----------
const dnLine = (sku, qty, over = {}) => {
  const p = P[sku]
  return { product_id: p.id, qty, name: p.dn_name ?? p.name, detail: p.dn_detail ?? null, components: p.dn_components ?? [], serials: [], ...over }
}
const tabNoDock = { components: [tabletParts[0], tabletParts[1], { name: 'Power adapter for tablet' }] }
const outletKit = (socket) => [dnLine('POS-I5-5G', 1), dnLine('SCN-GT8801D', 1), dnLine('PRN-XPRINTER', 1), dnLine('RFID-R20D', 2), dnLine('TAB-A11-SET', 1), dnLine('MOUSE-M120', 1), dnLine('KBD-Z10', 1), dnLine('SOCKET-DEEN', socket), dnLine('ID-LANYARD', 3)]

const doc = (type, seq, fields) => ({
  id: uid(`doc:${type}:${seq}`), client_id: client.id, type, seq,
  doc_no: `${{ INVOICE: 'WIT-INV', RECEIPT: 'WIT-R', DELIVERY_NOTE: 'WIT-DN' }[type]}-${client.doc_ref}-${String(seq).padStart(2, '0')}`,
  site_ids: [], lines: [], meta: {}, replaces_ids: [], source_dn_ids: [], due_date: null, title: null, intro: null, ...fields
})

export const dn = {
  1: doc('DELIVERY_NOTE', 1, { doc_date: '2026-11-01', status: 'issued', site_ids: [sites.ncl.id], meta: { billing: 'Invoice WIT-INV-2026-085-04' }, lines: outletKit(1) }),
  2: doc('DELIVERY_NOTE', 2, { doc_date: '2026-11-01', status: 'issued', site_ids: [sites.royal.id], meta: { billing: 'Invoice WIT-INV-2026-085-04' }, lines: outletKit(2) }),
  3: doc('DELIVERY_NOTE', 3, { doc_date: '2026-11-01', status: 'issued', site_ids: [sites.kumb.id], meta: { billing: 'Invoice to follow' }, lines: [
    dnLine('POS-I5-5G', 2), dnLine('SCN-GT8801D', 2), dnLine('PRN-XPRINTER', 2), dnLine('ROLL-POS', 2), dnLine('RFID-R20D', 2), dnLine('TAB-A11-SET', 1),
    dnLine('MOUSE-M120', 2), dnLine('KBD-Z10', 2), dnLine('SOCKET-DEEN', 2), dnLine('ID-CARD', 3), dnLine('LANYARD', 1)] }),
  4: doc('DELIVERY_NOTE', 4, { doc_date: '2026-10-30', status: 'issued', site_ids: [sites.thel.id], meta: { billing: 'Invoice to follow' }, lines: [
    dnLine('POS-I5-5G', 1), dnLine('SCN-GT8801D', 1), dnLine('PRN-XPRINTER', 1), dnLine('ROLL-POS', 1), dnLine('RFID-R20D', 2), dnLine('TAB-A11-SET', 1, tabNoDock),
    dnLine('MOUSE-M120', 1), dnLine('KBD-Z10', 1), dnLine('SOCKET-DEEN', 1), dnLine('ID-LANYARD', 3)] })
}

// ---------- invoices ----------
const invLine = (group, sku, qty, over = {}) => {
  const p = P[sku]
  return {
    ...group, product_id: p.id, description: p.name, ...(p.invoice_detail ? { detail: p.invoice_detail } : {}),
    qty, unit_price: p.is_free ? 0 : p.price, is_free: !!p.is_free, kind: p.kind, ...over
  }
}
const custom = (group, description, detail, qty, unit_price, kind = 'hardware') =>
  ({ ...group, product_id: null, description, ...(detail ? { detail } : {}), qty, unit_price, is_free: false, kind })
const grp = (key, label, kind = 'outlet', dn_no = null) => ({ group: key, group_label: label, group_kind: kind, ...(dn_no ? { dn_no } : {}) })

const gTham = grp('tham', 'Thambapanni Wine Stores, Godagama')
const atCounter = 'Computer for running the POS application at the counter'
const inv01Lines = g => [
  custom(g, 'POS terminal — Intel Core i5, 3rd generation', atCounter, 1, 110000),
  custom(g, 'POS terminal — Intel Core i5, 5th generation', atCounter, 2, 120000),
  custom(g, 'Thermal POS receipt printer — Xprinter', 'For printing customer bills at the counter', 3, 14700),
  custom(g, 'Desktop barcode scanner — hands-free', 'Sits on the counter top; scans product barcodes without being held', 3, 8400)
].map((l, i) => ({ ...l, product_id: [P['POS-I5-3G'], P['POS-I5-5G'], P['PRN-XPRINTER'], P['SCN-GT8801D']][i].id }))

const billedSeparately = 'This hardware is billed separately from the software project fees, as per the Project Agreement.'
const old05 = (g, sku, qty, desc) => invLine(g, sku, qty, { ...(desc ? { description: desc } : {}), detail: undefined })
const inv05Outlet = (g, sock) => [
  old05(g, 'POS-I5-5G', 1), old05(g, 'SCN-GT8801D', 1), old05(g, 'PRN-XPRINTER', 1), old05(g, 'RFID-R20D', 2, 'RFID card reader (R260-USB)'),
  old05(g, 'TAB-A11-SET', 1, 'Samsung Galaxy Tab A11+ 5G set — with screen protector, pouch & charging dock'),
  old05(g, 'MOUSE-M120', 1), old05(g, 'KBD-Z10', 1), { ...old05(g, 'SOCKET-DEEN', sock), unit_price: 1450 }, old05(g, 'ID-LANYARD', 3)
]
const strip = l => JSON.parse(JSON.stringify(l))

const g06 = {
  ncl: grp(sites.ncl.id, sites.ncl.name, 'outlet', 'WIT-DN-2026-085-01'),
  royal: grp(sites.royal.id, sites.royal.name, 'outlet', 'WIT-DN-2026-085-02'),
  kumb: grp(sites.kumb.id, sites.kumb.name, 'outlet', 'WIT-DN-2026-085-03'),
  thel: grp(sites.thel.id, sites.thel.name, 'outlet', 'WIT-DN-2026-085-04'),
  owner: grp(sites.owner.id, 'Owner tablet — Mr. Jayantha Munaweera', 'other')
}
const kit06 = (g, sock) => [invLine(g, 'SW-LSMS-OUTLET', 1), invLine(g, 'POS-I5-5G', 1), invLine(g, 'SCN-GT8801D', 1), invLine(g, 'PRN-XPRINTER', 1), invLine(g, 'RFID-R20D', 2),
  invLine(g, 'TAB-A11-SET', 1), invLine(g, 'MOUSE-M120', 1), invLine(g, 'KBD-Z10', 1), invLine(g, 'SOCKET-DEEN', sock), invLine(g, 'ID-LANYARD', 3)]

export const inv = {}
inv[1] = doc('INVOICE', 1, { doc_date: '2026-10-08', due_date: '2026-10-10', status: 'replaced', site_ids: [sites.tham.id],
  title: 'POS Hardware — Thambapanni Wine Stores, Godagama',
  intro: 'POS equipment supplied for the Liquor Store Management System implementation at Thambapanni Wine Stores, Godagama, scheduled for Saturday, 10 October 2026.',
  meta: { terms_extra: [billedSeparately] }, lines: strip(inv01Lines(gTham)) })
inv[2] = doc('INVOICE', 2, { doc_date: '2026-10-13', due_date: '2026-10-20', status: 'replaced', site_ids: [sites.tham.id],
  title: 'Manager Tablet — Thambapanni Wine Stores, Godagama',
  intro: 'Tablet supplied for the store manager, for using the Liquor Store Management System dashboard on the move.',
  meta: { terms_extra: ['Please keep this invoice as proof of purchase for guarantee claims.', billedSeparately] },
  lines: [custom(gTham, 'Samsung Galaxy Tab A11+ tablet (6 GB RAM, 128 GB storage) — with accessories', 'Supplied as one set: tablet, screen guard (fitted), protective pouch and charging dock', 1, 87000)]
    .map(l => ({ ...l, product_id: P['TAB-A11-SET'].id })) })
inv[3] = doc('INVOICE', 3, { doc_date: '2026-10-22', due_date: '2026-10-22', status: 'paid', site_ids: [sites.tham.id],
  title: 'Advance Payment & Hardware — Statement of Amount Due',
  intro: 'This invoice brings together the project advance and the hardware supplied for Thambapanni Wine Stores, Godagama, less the payment already received.',
  meta: { terms_extra: ['Please keep this invoice as proof of purchase for warranty and guarantee claims.', 'The remaining 60% of the project fees is invoiced as each outlet goes live, as per the Project Agreement.'] },
  lines: strip([
    custom(grp('advance', 'Project advance — Quotation WIT-Q-2026-085-R1', 'other'), 'Advance payment — 40% of the Year 1 project fees',
      'Liquor Store Management System, Multi-Branch Edition: main branch + 10 outlets (Year 1 fees Rs. 1,900,000.00)', 1, 760000, 'software'),
    ...inv01Lines(grp('inv01', 'POS hardware — Invoice WIT-INV-2026-085-01 (1-year warranty)', 'other')),
    { ...custom(grp('inv02', 'Manager tablet — Invoice WIT-INV-2026-085-02 (1-year guarantee)', 'other'), 'Samsung Galaxy Tab A11+ (6 GB RAM, 128 GB storage)',
      'With screen guard (fitted), protective pouch and charging dock', 1, 87000), product_id: P['TAB-A11-SET'].id }
  ]) })
inv[4] = doc('INVOICE', 4, { doc_date: '2026-10-27', status: 'replaced', // ASSUMED date: before receipt 085-03 (27 Oct) which mentions it
  site_ids: [sites.ncl.id, sites.thal.id, sites.royal.id],
  title: 'Hardware Sets — City Light, Thalathuoya and Royal Wine Stores',
  meta: { header_only: true, note: 'Line items not on record — no PDF of this invoice was provided. Total from receipt WIT-R-2026-085-03.' },
  lines: [custom(grp('sets', 'Hardware sets — City Light, Thalathuoya and Royal Wine Stores', 'other'), 'Hardware sets for three outlets (line items not on record)', null, 1, 690300)] })
inv[5] = doc('INVOICE', 5, { doc_date: '2026-11-01', due_date: '2026-11-08', status: 'replaced', site_ids: [sites.ncl.id, sites.royal.id, sites.kumb.id],
  title: 'POS Hardware & Devices — JMC Wines Group Outlets',
  intro: "Hardware and devices delivered on 1 November 2026 to the three outlets below, as signed for on each outlet's delivery note.",
  meta: { outlets_text: 'New City Light, Royal & Kumbukgete Wine Stores', terms_extra: [billedSeparately] },
  lines: strip([
    ...inv05Outlet(grp(sites.ncl.id, sites.ncl.name, 'outlet', 'WIT-DN-2026-085-01'), 1),
    ...inv05Outlet(grp(sites.royal.id, sites.royal.name, 'outlet', 'WIT-DN-2026-085-02'), 2),
    ...[old05(g06.kumb, 'POS-I5-5G', 2), old05(g06.kumb, 'SCN-GT8801D', 2), old05(g06.kumb, 'PRN-XPRINTER', 2), old05(g06.kumb, 'ROLL-POS', 2),
      old05(g06.kumb, 'RFID-R20D', 2, 'RFID card reader (R260-USB)'), old05(g06.kumb, 'TAB-A11-SET', 1, 'Samsung Galaxy Tab A11+ 5G set — with screen protector, pouch & charging dock'),
      old05(g06.kumb, 'MOUSE-M120', 2), old05(g06.kumb, 'KBD-Z10', 2), { ...old05(g06.kumb, 'SOCKET-DEEN', 2), unit_price: 1450 }, old05(g06.kumb, 'ID-CARD', 3), old05(g06.kumb, 'LANYARD', 1)]
  ]) })
inv[6] = doc('INVOICE', 6, { doc_date: '2026-11-01', due_date: '2026-11-08', status: 'open',
  site_ids: [sites.ncl.id, sites.royal.id, sites.kumb.id, sites.thel.id, sites.owner.id],
  title: 'Software & Hardware — JMC Wines Group Outlets',
  intro: "Outlet software and the hardware delivered to four outlets, as signed for on each outlet's delivery note, plus a tablet for the owner.",
  source_dn_ids: [dn[1].id, dn[2].id, dn[3].id, dn[4].id],
  lines: strip([
    ...kit06(g06.ncl, 1), ...kit06(g06.royal, 2),
    invLine(g06.kumb, 'SW-LSMS-OUTLET', 1), invLine(g06.kumb, 'POS-I5-5G', 2), invLine(g06.kumb, 'SCN-GT8801D', 2), invLine(g06.kumb, 'PRN-XPRINTER', 2), invLine(g06.kumb, 'ROLL-POS', 2),
    invLine(g06.kumb, 'RFID-R20D', 2), invLine(g06.kumb, 'TAB-A11-SET', 1), invLine(g06.kumb, 'MOUSE-M120', 2), invLine(g06.kumb, 'KBD-Z10', 2), invLine(g06.kumb, 'SOCKET-DEEN', 2),
    invLine(g06.kumb, 'ID-CARD', 3), invLine(g06.kumb, 'LANYARD', 1),
    invLine(g06.thel, 'SW-LSMS-OUTLET', 1), invLine(g06.thel, 'POS-I5-5G', 1), invLine(g06.thel, 'SCN-GT8801D', 1), invLine(g06.thel, 'PRN-XPRINTER', 1), invLine(g06.thel, 'ROLL-POS', 1),
    invLine(g06.thel, 'RFID-R20D', 2), invLine(g06.thel, 'TAB-A11-SET', 1, { detail: 'With tempered glass screen protector, pouch and power adapter' }),
    invLine(g06.thel, 'MOUSE-M120', 1), invLine(g06.thel, 'KBD-Z10', 1), invLine(g06.thel, 'SOCKET-DEEN', 1), invLine(g06.thel, 'ID-LANYARD', 3),
    invLine(g06.owner, 'TAB-A11-SET', 1)
  ]) })

// replacement chain: 01,02 → 03 ; 04 → 05 → 06 (06 prints "replaces 04 and 05")
inv[3].replaces_ids = [inv[1].id, inv[2].id]
inv[5].replaces_ids = [inv[4].id]
inv[6].replaces_ids = [inv[4].id, inv[5].id]
export const replacedBy = { [inv[1].id]: inv[3].id, [inv[2].id]: inv[3].id, [inv[4].id]: inv[5].id, [inv[5].id]: inv[6].id }
for (const d of Object.values(inv)) d.replaced_by_id = replacedBy[d.id] ?? null

// ---------- receipts + payments (all against 085-03) ----------
export const rc = {
  1: doc('RECEIPT', 1, { doc_date: '2026-10-08', status: 'issued', total: 300000,
    title: 'Liquor Store Management System — Multi-Branch Edition',
    intro: 'Received with thanks from Mr. Jayantha Munaweera the sum stated below, as the first part of the 40% advance payment towards the Year 1 project fees.',
    meta: { payment_description: 'Advance payment (part 1 of the 40% advance) — Liquor Store Management System, Multi-Branch Edition',
      payment_detail: 'Towards the Year 1 project fees for the main branch and 10 outlets, as per Quotation WIT-Q-2026-085-R1', software_label: 'project advance', hardware_label: 'POS hardware + manager tablet' } }),
  2: doc('RECEIPT', 2, { doc_date: '2026-10-27', status: 'issued', total: 500000,
    meta: { software_label: 'project advance', hardware_label: 'POS hardware + manager tablet',
      invoice_detail: 'Advance Rs. 760,000.00 + POS hardware Rs. 419,300.00 + manager tablet Rs. 87,000.00' } }),
  3: doc('RECEIPT', 3, { doc_date: '2026-10-27', status: 'issued', total: 466300,
    title: 'Liquor Store Management System — Advance & Hardware',
    intro: 'Received with thanks from Mr. Jayantha Munaweera the sum stated below, as the final payment of Invoice WIT-INV-2026-085-03 (project advance and hardware).',
    meta: {
      payment_description: 'Final payment — Invoice WIT-INV-2026-085-03',
      payment_detail: 'Balance for the POS hardware and manager tablet supplied to Thambapanni Wine Stores, Godagama',
      invoice_detail: 'Advance Rs. 760,000.00 + POS hardware Rs. 419,300.00 + manager tablet Rs. 87,000.00',
      software_label: 'project advance', hardware_label: 'POS hardware + manager tablet',
      thanks_title: 'Thank you — Invoice WIT-INV-2026-085-03 will be fully settled once the cheque clears.',
      thanks_body: 'The 40% project advance, the POS hardware and the manager tablet for Thambapanni Wine Stores, Godagama will be fully settled when this cheque is realised. We will confirm with you once the payment has cleared. We truly appreciate your prompt payments.',
      footnote_extra: 'Invoice WIT-INV-2026-085-04 (hardware sets for City Light, Thalathuoya and Royal Wine Stores, Rs. 690,300.00) is billed separately and is not covered by this receipt. The remaining 60% of the project fees is invoiced as each outlet goes live, as per the Project Agreement.'
    } })
}
for (const r of Object.values(rc)) r.meta = { ...r.meta, against_invoice_id: inv[3].id, against_invoice_no: inv[3].doc_no }

export const payments = [
  { id: uid('pay:1'), receipt: rc[1], paid_on: '2026-10-05', amount: 300000, method: 'cheque', cheque_no: '762771', cheque_status: 'cleared', software_amount: 300000, hardware_amount: null, pm_invoice_no: 'INV-0017' }, // ASSUMED cleared
  { id: uid('pay:2'), receipt: rc[2], paid_on: '2026-10-27', amount: 500000, method: null, cheque_no: null, cheque_status: null, software_amount: 460000, hardware_amount: 40000, pm_invoice_no: 'INV-0022' }, // method not recorded
  { id: uid('pay:3'), receipt: rc[3], paid_on: '2026-10-27', amount: 466300, method: 'cheque', cheque_no: null, cheque_status: 'pending', software_amount: null, hardware_amount: 466300, pm_invoice_no: 'INV-0023' }
].map(p => ({ ...p, client_id: client.id, invoice_id: inv[3].id, receipt_id: p.receipt.id }))

// ---------- stock ledger ----------
const HIST = 'Historic balance: stock that was in the office before this delivery (reconstructed from the delivery document).'
const stockLines = lines => lines.filter(l => products.find(p => p.id === l.product_id).is_stock)
const delivery = (date, siteObj, docObj, lines) => ({ date, site: siteObj, doc: docObj, lines: stockLines(lines).map(l => ({ product_id: l.product_id, qty: l.qty })) })
export const deliveries = [
  delivery('2026-10-10', sites.tham, inv[1], [{ product_id: P['POS-I5-3G'].id, qty: 1 }, { product_id: P['POS-I5-5G'].id, qty: 2 }, { product_id: P['PRN-XPRINTER'].id, qty: 3 }, { product_id: P['SCN-GT8801D'].id, qty: 3 }]),
  delivery('2026-10-13', sites.tham, inv[2], [{ product_id: P['TAB-A11-SET'].id, qty: 1 }]),
  delivery('2026-10-30', sites.thel, dn[4], dn[4].lines),
  delivery('2026-11-01', sites.ncl, dn[1], dn[1].lines),
  delivery('2026-11-01', sites.royal, dn[2], dn[2].lines),
  delivery('2026-11-01', sites.kumb, dn[3], dn[3].lines),
  delivery('2026-11-01', sites.owner, inv[6], [{ product_id: P['TAB-A11-SET'].id, qty: 1 }])
]
export const historicNote = HIST

// Office count, 3 Nov 2026 (handwritten sheet). left → OPENING movements.
export const countSheet = {
  id: uid('count:2026-11-03'), counted_on: '2026-11-03', location_id: office.id,
  notes: 'Handwritten office count, 3 Nov 2026. ASSUMED: the 5 POS terminals are 5th generation; the 6 network cables left are 3 × 1.5 m + 3 × 3 m; 9 HDMI cables left (1 used of 10).',
  lines: [
    { label: 'Tablet', skus: ['TAB-A11-SET'], used: 9, left: { 'TAB-A11-SET': 1 } },
    { label: 'POS terminal', skus: ['POS-I5-5G', 'POS-I5-3G'], used: 10, left: { 'POS-I5-5G': 5 } },
    { label: 'Keyboard', skus: ['KBD-Z10'], used: 10, left: { 'KBD-Z10': 5 } },
    { label: 'Mouse', skus: ['MOUSE-M120'], used: 10, left: { 'MOUSE-M120': 5 } },
    { label: 'Power extension socket', skus: ['SOCKET-DEEN'], used: 6, left: { 'SOCKET-DEEN': 0 } },
    { label: 'Network cable', skus: ['NET-1.5M', 'NET-3M'], used: 6, note: '3 × 1.5 m, 3 × 3 m used', left: { 'NET-1.5M': 3, 'NET-3M': 3 } },
    { label: 'Wi-Fi adapter', skus: ['WIFI-ADAPTER'], used: 5, left: { 'WIFI-ADAPTER': 5 } },
    { label: 'Printer', skus: ['PRN-XPRINTER'], used: 7, left: { 'PRN-XPRINTER': 2 } },
    { label: 'Barcode reader', skus: ['SCN-GT8801D'], used: 5, left: { 'SCN-GT8801D': 0 } },
    { label: 'Printer roll', skus: ['ROLL-POS'], used: 8, left: { 'ROLL-POS': 5 } },
    { label: 'HDMI cable', skus: ['HDMI'], used: 1, note: '1 used of 10', left: { HDMI: 9 } },
    { label: 'Charging dock', skus: ['TAB-DOCK'], used: null, left: { 'TAB-DOCK': 1 } },
    { label: 'RFID reader', skus: ['RFID-R20D'], used: 6, left: { 'RFID-R20D': 0 } }
  ]
}

// Reference PDFs stored as version 1 ("original") of each seeded document.
export const originals = {
  [inv[1].doc_no]: 'WIT-INV-2026-085-01-Hardware-Mr-Jayantha.pdf',
  [inv[2].doc_no]: 'WIT-INV-2026-085-02-Tablet-Mr-Jayantha.pdf',
  [inv[3].doc_no]: 'WIT-INV-2026-085-03-Consolidated-Mr-Jayantha.pdf',
  [inv[5].doc_no]: 'WIT-INV-2026-085-05-Hardware-3-Outlets-JMC.pdf',
  [inv[6].doc_no]: 'WIT-INV-2026-085-06-JMC-4-Outlets (2).pdf',
  [rc[1].doc_no]: 'WIT-R-2026-085-01-Receipt-Mr-Jayantha.pdf',
  [rc[3].doc_no]: 'WIT-R-2026-085-03-Receipt-Mr-Jayantha.pdf',
  [dn[1].doc_no]: 'WIT-DN-2026-085-01-New-City-Light-Wine-Stores.pdf',
  [dn[2].doc_no]: 'WIT-DN-2026-085-02-Royal-Wine-Stores.pdf',
  [dn[3].doc_no]: 'WIT-DN-2026-085-03-Kumbukgete-Wine-Stores (1).pdf',
  [dn[4].doc_no]: 'WIT-DN-2026-085-04-Theldeniya-Wine-Stores.pdf'
}

export const documents = [...Object.values(dn), ...Object.values(inv), ...Object.values(rc)]
