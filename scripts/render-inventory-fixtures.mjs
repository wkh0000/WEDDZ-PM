// Render every inventory PDF fixture and check determinism.
//   node scripts/render-inventory-fixtures.mjs <outDir>
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderPdf } from '../src/features/inventory/pdf/render.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const fixtures = path.join(root, 'src/features/inventory/pdf/__fixtures__')
const outDir = path.resolve(process.argv[2] || path.join(root, 'tmp-inventory-pdfs'))
fs.mkdirSync(outDir, { recursive: true })

let failed = false
for (const f of fs.readdirSync(fixtures).filter(n => n.endsWith('.json')).sort()) {
  const vm = JSON.parse(fs.readFileSync(path.join(fixtures, f), 'utf8'))
  const a = await renderPdf(vm)
  const b = await renderPdf(JSON.parse(JSON.stringify(vm)))
  const same = a.length === b.length && a.every((v, i) => v === b[i])
  const out = path.join(outDir, f.replace(/\.json$/, '.pdf'))
  fs.writeFileSync(out, a)
  console.log(`${same ? 'OK  ' : 'DIFF'} ${out} (${a.length} bytes)`)
  if (!same) failed = true
}
if (failed) {
  console.error('Non-deterministic output: the same view model produced different bytes.')
  process.exit(1)
}
