import { forwardRef } from 'react'
import { cn } from '@/lib/cn'
import Spinner from './Spinner'

const variants = {
  primary: 'bg-indigo-500 hover:bg-indigo-400 active:bg-indigo-600 text-white border-indigo-500 shadow-glow',
  subtle:  'bg-white/[0.06] hover:bg-white/10 text-zinc-100 border-white/10',
  ghost:   'bg-transparent hover:bg-white/5 text-zinc-200 border-transparent',
  outline: 'bg-transparent hover:bg-white/5 text-zinc-200 border-white/15',
  danger:  'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border-rose-500/30',
  success: 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border-emerald-500/30'
}

const sizes = {
  xs: 'h-7 px-2.5 text-xs',
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base'
}

const Button = forwardRef(function Button(
  {
    className,
    variant = 'primary',
    size = 'md',
    loading = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    type = 'button',
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-all duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'lg' ? 'sm' : 'sm'} /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  )
})

export default Button
