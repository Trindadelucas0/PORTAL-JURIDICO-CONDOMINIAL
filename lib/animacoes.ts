import gsap from 'gsap'

export function entradaDeBaixo(
  el: Element | Element[],
  opts?: { delay?: number; distance?: number; duration?: number },
) {
  const { delay = 0, distance = 30, duration = 0.7 } = opts ?? {}
  return gsap.fromTo(
    el,
    { y: distance, opacity: 0 },
    { y: 0, opacity: 1, duration, delay, ease: 'power3.out' },
  )
}

export function escalonarFilhos(
  parent: Element,
  childSelector: string,
  opts?: { stagger?: number; distance?: number; duration?: number },
) {
  const { stagger = 0.08, distance = 24, duration = 0.6 } = opts ?? {}
  const children = parent.querySelectorAll(childSelector)
  if (!children.length) return null
  return gsap.fromTo(
    children,
    { y: distance, opacity: 0 },
    { y: 0, opacity: 1, duration, stagger, ease: 'power3.out' },
  )
}

export function contarAte(
  el: Element,
  valorFinal: number,
  opts?: { duration?: number; prefixo?: string; sufixo?: string },
) {
  const { duration = 1.5, prefixo = '', sufixo = '' } = opts ?? {}
  const obj = { val: 0 }
  return gsap.to(obj, {
    val: valorFinal,
    duration,
    ease: 'power2.out',
    onUpdate: () => {
      el.textContent = `${prefixo}${Math.round(obj.val)}${sufixo}`
    },
  })
}

export function deslizarDaLateral(
  el: Element | Element[],
  direcao: 'esquerda' | 'direita' = 'esquerda',
  opts?: { duration?: number; distance?: number },
) {
  const { duration = 0.6, distance = 40 } = opts ?? {}
  const x = direcao === 'esquerda' ? -distance : distance
  return gsap.fromTo(
    el,
    { x, opacity: 0 },
    { x: 0, opacity: 1, duration, ease: 'power3.out' },
  )
}

export function escalarEntrada(
  el: Element | Element[],
  opts?: { delay?: number; duration?: number },
) {
  const { delay = 0, duration = 0.5 } = opts ?? {}
  return gsap.fromTo(
    el,
    { scale: 0.85, opacity: 0 },
    { scale: 1, opacity: 1, duration, delay, ease: 'back.out(1.4)' },
  )
}
