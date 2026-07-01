import { useEffect, useRef, useState } from 'react'

interface Point {
  x: number
  y: number
}

const MIN_SIZE = 24

export default function RegionSelect(): React.JSX.Element {
  const [start, setStart] = useState<Point | null>(null)
  const [current, setCurrent] = useState<Point | null>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        window.beam.submitRegionResult(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function onMouseDown(e: React.MouseEvent): void {
    draggingRef.current = true
    const p = { x: e.clientX, y: e.clientY }
    setStart(p)
    setCurrent(p)
  }

  function onMouseMove(e: React.MouseEvent): void {
    if (!draggingRef.current) return
    setCurrent({ x: e.clientX, y: e.clientY })
  }

  function onMouseUp(): void {
    if (!draggingRef.current || !start || !current) return
    draggingRef.current = false

    const left = Math.min(start.x, current.x)
    const top = Math.min(start.y, current.y)
    const width = Math.abs(current.x - start.x)
    const height = Math.abs(current.y - start.y)

    if (width < MIN_SIZE || height < MIN_SIZE) {
      setStart(null)
      setCurrent(null)
      return
    }

    const vw = window.innerWidth
    const vh = window.innerHeight
    window.beam.submitRegionResult({
      xFrac: left / vw,
      yFrac: top / vh,
      wFrac: width / vw,
      hFrac: height / vh
    })
  }

  const rect =
    start && current
      ? {
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          width: Math.abs(current.x - start.x),
          height: Math.abs(current.y - start.y)
        }
      : null

  return (
    <div
      className="region-select"
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      {!rect && <div className="region-select__hint">Drag to select a region · Esc to cancel</div>}

      {rect && (
        <>
          <div
            className="region-select__mask"
            style={{ left: 0, top: 0, right: 0, height: rect.top }}
          />
          <div
            className="region-select__mask"
            style={{ left: 0, top: rect.top + rect.height, right: 0, bottom: 0 }}
          />
          <div
            className="region-select__mask"
            style={{ left: 0, top: rect.top, width: rect.left, height: rect.height }}
          />
          <div
            className="region-select__mask"
            style={{
              left: rect.left + rect.width,
              top: rect.top,
              right: 0,
              height: rect.height
            }}
          />
          <div
            className="region-select__box"
            style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          >
            <span className="region-select__dims">
              {Math.round(rect.width)} × {Math.round(rect.height)}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
