import { useEffect, useRef, useState } from 'react'

interface Ripple {
  id: number
  x: number
  y: number
}

let nextId = 0

export default function InputOverlay(): React.JSX.Element {
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [key, setKey] = useState<{ id: number; label: string } | null>(null)
  const keyTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const offClick = window.beam.onInputClick(({ x, y }) => {
      const id = nextId++
      setRipples((prev) => [...prev, { id, x, y }])
      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id))
      }, 600)
    })
    const offKey = window.beam.onInputKey((label) => {
      setKey({ id: nextId++, label })
      if (keyTimerRef.current) window.clearTimeout(keyTimerRef.current)
      keyTimerRef.current = window.setTimeout(() => setKey(null), 1400)
    })
    return () => {
      offClick()
      offKey()
    }
  }, [])

  return (
    <div className="input-overlay">
      {ripples.map((r) => (
        <span key={r.id} className="input-overlay__ripple" style={{ left: r.x, top: r.y }} />
      ))}
      {key && (
        <div key={key.id} className="input-overlay__key">
          {key.label}
        </div>
      )}
    </div>
  )
}
