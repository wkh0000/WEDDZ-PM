import { cn } from '@/lib/cn'

const sizes = {
  xs: 'h-3 w-3 border',
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-10 w-10 border-2'
}

export default function Spinner({ size = 'md', className }) {
  return (
    <span
      role="status"
      aria-label="loading"
      className={cn(
        'inline-block animate-spin rounded-full border-indigo-400 border-t-transparent',
        sizes[size],
        className
      )}
    />
  )
}
