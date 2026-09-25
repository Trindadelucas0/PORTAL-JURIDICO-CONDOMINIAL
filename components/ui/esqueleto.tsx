import { cn } from '@/lib/utils'

export function Esqueleto({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="esqueleto"
      className={cn(
        'animate-pulse rounded-lg bg-muted',
        className,
      )}
      {...props}
    />
  )
}

export function EsqueletoCard({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card p-5 space-y-3', className)}>
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <Esqueleto className="h-4 w-32" />
          <Esqueleto className="h-8 w-20" />
          <Esqueleto className="h-3 w-40" />
        </div>
        <Esqueleto className="size-10 rounded-lg" />
      </div>
    </div>
  )
}

export function EsqueletoLista({ linhas = 5, className }: { linhas?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Esqueleto className="h-3 w-16" />
            <Esqueleto className="h-5 w-12 rounded-full" />
          </div>
          <Esqueleto className="h-4 w-3/4" />
          <Esqueleto className="h-3 w-1/2" />
        </div>
      ))}
    </div>
  )
}
