'use client'

import { useRef, useEffect, useState } from 'react'
import gsap from 'gsap'
import { cn } from '@/lib/utils'

export function ContadorAnimado({
  valor,
  prefixo = '',
  sufixo = '',
  duracao = 1.5,
  className,
}: {
  valor: number | string
  prefixo?: string
  sufixo?: string
  duracao?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  const [jaAnimou, setJaAnimou] = useState(false)

  const valorNumerico = typeof valor === 'string' ? parseInt(valor.replace(/\D/g, ''), 10) : valor
  const ehNumero = !isNaN(valorNumerico)

  useEffect(() => {
    const el = ref.current
    if (!el || !ehNumero || jaAnimou) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setJaAnimou(true)
          const obj = { val: 0 }
          gsap.to(obj, {
            val: valorNumerico,
            duration: duracao,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = `${prefixo}${Math.round(obj.val)}${sufixo}`
            },
          })
          observer.unobserve(el)
        }
      },
      { threshold: 0.3 },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [valorNumerico, ehNumero, jaAnimou, duracao, prefixo, sufixo])

  if (!ehNumero) {
    return <span className={cn(className)}>{valor}</span>
  }

  return (
    <span ref={ref} className={cn(className)}>
      {prefixo}0{sufixo}
    </span>
  )
}
