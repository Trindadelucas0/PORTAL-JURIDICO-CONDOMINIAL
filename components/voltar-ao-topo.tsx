'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export function VoltarAoTopo() {
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisivel(window.scrollY > 400)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function irAoTopo() {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <button
      onClick={irAoTopo}
      aria-label="Voltar ao topo"
      className={cn(
        'fixed bottom-6 right-6 z-40 flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-all duration-300',
        visivel
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      <ArrowUp className="size-4" />
    </button>
  )
}
