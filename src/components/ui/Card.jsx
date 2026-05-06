import { forwardRef } from 'react'
import { cn } from '@/lib/cn'

const Card = forwardRef(function Card(
  { className, hover = false, padded = true, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        'glass rounded-2xl',
        padded && 'p-5',
        hover && 'transition-all duration-200 hover:border-white/15 hover:bg-white/[0.06]',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})

export default Card
