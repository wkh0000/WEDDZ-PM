import { useState } from 'react'
import { Download } from 'lucide-react'
import Button from './Button'
import { downloadTablePdf } from '@/lib/exportPdf'
import { useToast } from '@/context/ToastContext'

/**
 * "Download PDF" button for list pages. Pass `data` as the PDF payload
 * (see downloadTablePdf) or a function returning it — the function form
 * is evaluated on click so it captures the current filtered rows.
 */
export default function DownloadPdfButton({
  data, disabled = false, size = 'md', variant = 'subtle', label = 'Download PDF'
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)

  async function onClick() {
    setBusy(true)
    try {
      const payload = typeof data === 'function' ? await data() : data
      if (!payload || !payload.rows?.length) {
        toast.info('Nothing to export yet')
        return
      }
      await downloadTablePdf(payload)
    } catch (e) {
      toast.error(e.message || 'PDF export failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Button
      onClick={onClick}
      loading={busy}
      disabled={disabled}
      size={size}
      variant={variant}
      leftIcon={<Download className="w-4 h-4" />}
    >
      {label}
    </Button>
  )
}
