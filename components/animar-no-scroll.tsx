'use client'

import { useRef, useEffect, type ReactNode } from 'react'
import gsap from 'gsap'
import { cn } from '@/lib/utils'

type Animacao =
  | 'surgir'
  | 'surgir-de-baixo'
  | 'escalar'
  | 'deslizar-esquerda'
  | 'deslizar-direita'

const configs: Record<Animacao, gsap.TweenVars> = {
  surgir: { opacity: 0 },
  'surgir-de-baixo': { opacity: 0, y: 30 },
  escalar: { opacity: 0, scale: 0.92 },
  'deslizar-esquerda': { opacity: 0, x: -40 },
  'deslizar-direita': { opacity: 0, x: 40 },
}

export function AnimarNoScroll({
  children,
  animacao = 'surgir-de-baixo',
  duracao = 0.7,
  atraso = 0,
  className,
}: {
  children: ReactNode
  animacao?: Animacao
  duracao?: number
  atraso?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    gsap.set(el, configs[animacao])

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          gsap.to(el, {
            opacity: 1,
            y: 0,
            x: 0,
            scale: 1,
            duration: duracao,
            delay: atraso,
            ease: 'power3.out',
          })
          observer.unobserve(el)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [animacao, duracao, atraso])

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  )
}
