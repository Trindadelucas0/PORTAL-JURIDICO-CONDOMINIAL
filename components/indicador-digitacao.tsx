'use client'

import { cn } from '@/lib/utils'

export function IndicadorDigitacao({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-1', className)}>
      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-primary/60 [animation-delay:300ms]" />
    </div>
  )
}
