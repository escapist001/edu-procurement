import { useEffect, useRef, useState } from 'react'
import { animate, useReducedMotion } from 'framer-motion'

export function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const [disp, setDisp] = useState(value)
  const prev = useRef(value)
  const reduce = useReducedMotion()
  useEffect(() => {
    if (reduce) {
      setDisp(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration: 0.7,
      ease: 'easeOut',
      onUpdate: (v) => setDisp(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, reduce])
  return <>{format(disp)}</>
}
