import { useEffect, useRef, useState } from 'react'
import { toPlaybackUrl } from '../lib/fileUrl'
import type { CaptionStyle, RegionRect, TrimSegment } from '../../../preload/index'
import {
  IconCheck,
  IconCopy,
  IconCrop,
  IconFolder,
  IconGif,
  IconPause,
  IconPlay,
  IconScissors,
  IconX
} from '../components/Icons'
import Logo from '../components/Logo'

const MIN_SEG_LEN = 0.2
const MIN_CROP_FRAC = 0.1

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v))
}

type CropHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se'
interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Editor({
  filePath,
  micPath,
  liveSrtPath
}: {
  filePath: string
  micPath?: string | null
  liveSrtPath?: string | null
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const videoWrapRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ index: number; edge: 'start' | 'end' } | null>(null)
  const dragRectRef = useRef<DOMRect | null>(null)
  const pendingXRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const cropDragRef = useRef<{
    handle: CropHandle
    startClientX: number
    startClientY: number
    startRect: CropRect
    wrapRect: DOMRect
  } | null>(null)
  const cropPendingRef = useRef<{ x: number; y: number } | null>(null)
  const cropRafRef = useRef<number | null>(null)

  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [segments, setSegments] = useState<TrimSegment[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState<'trim' | 'gif' | 'transcribe' | 'captions' | 'crop' | null>(null)
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState<CropRect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  // Live captions transcribe quietly in the background during recording
  // (see liveCaption.ts) rather than showing anything live on screen —
  // this is where that pays off: the caption panel and this status line are
  // both ready from the very first render instead of the user waiting
  // through a fresh Transcribe pass.
  const [statusMsg, setStatusMsg] = useState(() =>
    liveSrtPath
      ? 'Live transcript ready — customize captions below, or Transcribe again for a cleaner pass.'
      : ''
  )
  const [copied, setCopied] = useState(false)

  const [srtPath, setSrtPath] = useState<string | null>(liveSrtPath ?? null)
  const [captionFontSize, setCaptionFontSize] = useState(24)
  const [captionColor, setCaptionColor] = useState('#ffffff')
  const [captionPosition, setCaptionPosition] = useState<CaptionStyle['position']>('bottom')

  useEffect(() => {
    function applyDrag(clientX: number): void {
      const dragging = draggingRef.current
      const rect = dragRectRef.current
      if (!dragging || !rect || duration === 0) return
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
      const time = ratio * duration

      setSegments((prev) => {
        const seg = prev[dragging.index]
        if (!seg) return prev
        const next = [...prev]
        if (dragging.edge === 'start') {
          const lowerBound = dragging.index > 0 ? next[dragging.index - 1].end : 0
          const clamped = Math.min(Math.max(time, lowerBound), seg.end - MIN_SEG_LEN)
          next[dragging.index] = { ...seg, start: clamped }
        } else {
          const upperBound =
            dragging.index < next.length - 1 ? next[dragging.index + 1].start : duration
          const clamped = Math.max(Math.min(time, upperBound), seg.start + MIN_SEG_LEN)
          next[dragging.index] = { ...seg, end: clamped }
        }
        return next
      })
    }
    // Raw pointermove can fire at 120-1000Hz depending on the mouse/display,
    // far faster than React (or the compositor) can actually paint. Without
    // throttling, every single move event forced a synchronous state update
    // and re-render — that pile-up of redundant work is what "laggy timeline
    // drag" actually was. Coalescing to one commit per animation frame keeps
    // the drag perfectly smooth at whatever the display's real refresh rate is.
    function onMove(e: PointerEvent): void {
      if (!draggingRef.current) return
      pendingXRef.current = e.clientX
      if (rafRef.current !== null) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        if (pendingXRef.current !== null) applyDrag(pendingXRef.current)
      })
    }
    function onUp(): void {
      draggingRef.current = null
      dragRectRef.current = null
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [duration])

  useEffect(() => {
    function applyCropDrag(clientX: number, clientY: number): void {
      const drag = cropDragRef.current
      if (!drag) return
      const dx = (clientX - drag.startClientX) / drag.wrapRect.width
      const dy = (clientY - drag.startClientY) / drag.wrapRect.height
      const { startRect, handle } = drag
      const next = { ...startRect }

      if (handle === 'move') {
        next.x = clamp01(Math.min(startRect.x + dx, 1 - startRect.w))
        next.y = clamp01(Math.min(startRect.y + dy, 1 - startRect.h))
      } else {
        if (handle === 'nw' || handle === 'sw') {
          const newX = Math.min(
            clamp01(startRect.x + dx),
            startRect.x + startRect.w - MIN_CROP_FRAC
          )
          next.w = startRect.x + startRect.w - newX
          next.x = newX
        } else {
          next.w = Math.min(Math.max(startRect.w + dx, MIN_CROP_FRAC), 1 - startRect.x)
        }
        if (handle === 'nw' || handle === 'ne') {
          const newY = Math.min(
            clamp01(startRect.y + dy),
            startRect.y + startRect.h - MIN_CROP_FRAC
          )
          next.h = startRect.y + startRect.h - newY
          next.y = newY
        } else {
          next.h = Math.min(Math.max(startRect.h + dy, MIN_CROP_FRAC), 1 - startRect.y)
        }
      }
      setCropRect(next)
    }
    function onMove(e: PointerEvent): void {
      if (!cropDragRef.current) return
      cropPendingRef.current = { x: e.clientX, y: e.clientY }
      if (cropRafRef.current !== null) return
      cropRafRef.current = requestAnimationFrame(() => {
        cropRafRef.current = null
        if (cropPendingRef.current)
          applyCropDrag(cropPendingRef.current.x, cropPendingRef.current.y)
      })
    }
    function onUp(): void {
      cropDragRef.current = null
      if (cropRafRef.current !== null) {
        cancelAnimationFrame(cropRafRef.current)
        cropRafRef.current = null
      }
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (cropRafRef.current !== null) cancelAnimationFrame(cropRafRef.current)
    }
  }, [])

  function beginCropDrag(handle: CropHandle, e: React.PointerEvent): void {
    e.stopPropagation()
    const wrapRect = videoWrapRef.current?.getBoundingClientRect()
    if (!wrapRect) return
    cropDragRef.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startRect: cropRect,
      wrapRect
    }
  }

  function toggleCropMode(): void {
    if (!cropMode) videoRef.current?.pause()
    setPlaying(false)
    setCropMode((v) => !v)
  }

  async function handleApplyCrop(): Promise<void> {
    setBusy('crop')
    setStatusMsg('Cropping…')
    try {
      const region: RegionRect = {
        xFrac: cropRect.x,
        yFrac: cropRect.y,
        wFrac: cropRect.w,
        hFrac: cropRect.h
      }
      const out = await window.beam.cropVideo(filePath, region)
      setStatusMsg(`Saved cropped copy: ${out}`)
      setCropMode(false)
    } catch (err) {
      setStatusMsg(`Crop failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  function activeSegmentIndex(t: number): number {
    return segments.findIndex((s) => t >= s.start && t < s.end)
  }

  function handleSplit(): void {
    const idx = segments.findIndex(
      (s) => current > s.start + MIN_SEG_LEN && current < s.end - MIN_SEG_LEN
    )
    if (idx === -1) return
    const seg = segments[idx]
    const next = [...segments]
    next.splice(idx, 1, { start: seg.start, end: current }, { start: current, end: seg.end })
    setSegments(next)
    setSelected(null)
  }

  function handleDeleteSegment(idx: number): void {
    if (segments.length <= 1) return
    setSegments((prev) => prev.filter((_, i) => i !== idx))
    setSelected(null)
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected !== null) {
        e.preventDefault()
        handleDeleteSegment(selected)
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault()
        handleSplit()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, segments, current])

  function handleLoadedMetadata(): void {
    const d = videoRef.current?.duration ?? 0
    setDuration(d)
    setSegments([{ start: 0, end: d }])
  }

  function togglePlay(): void {
    const video = videoRef.current
    if (!video || segments.length === 0) return
    if (video.paused) {
      if (activeSegmentIndex(video.currentTime) === -1) {
        const next = segments.find((s) => s.start > video.currentTime)
        video.currentTime = next ? next.start : segments[0].start
      }
      video.play().catch(() => {})
      setPlaying(true)
    } else {
      video.pause()
      setPlaying(false)
    }
  }

  function handleTimeUpdate(): void {
    const video = videoRef.current
    if (!video) return
    const t = video.currentTime
    setCurrent(t)
    if (activeSegmentIndex(t) === -1) {
      const next = segments.find((s) => s.start > t)
      if (next) {
        video.currentTime = next.start
      } else if (playing) {
        video.pause()
        setPlaying(false)
      }
    }
  }

  function seekFromTrackClick(e: React.MouseEvent): void {
    if (!trackRef.current || duration === 0) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrent(time)
    const idx = segments.findIndex((s) => time >= s.start && time <= s.end)
    setSelected(idx === -1 ? null : idx)
  }

  async function handleTrim(): Promise<void> {
    setBusy('trim')
    setStatusMsg('Exporting trimmed copy…')
    try {
      const out = await window.beam.trim(filePath, segments)
      setStatusMsg(`Saved: ${out}`)
    } catch (err) {
      setStatusMsg(`Trim failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleGif(): Promise<void> {
    setBusy('gif')
    setStatusMsg('Exporting GIF…')
    try {
      const out = await window.beam.exportGif(filePath, segments)
      setStatusMsg(`Saved GIF: ${out}`)
    } catch (err) {
      setStatusMsg(`GIF export failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleCopyFile(): Promise<void> {
    try {
      await window.beam.copyFile(filePath)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      setStatusMsg(`Copy failed: ${(err as Error).message}`)
    }
  }

  async function handleTranscribe(): Promise<void> {
    setBusy('transcribe')
    setStatusMsg('Transcribing…')
    try {
      const res = await window.beam.transcribe(filePath, micPath ?? undefined)
      setSrtPath(res.srtPath)
      setStatusMsg(res.text || 'No speech detected.')
    } catch (err) {
      setStatusMsg(`Transcription isn't set up yet (${(err as Error).message})`)
    } finally {
      setBusy(null)
    }
  }

  async function handleBurnCaptions(): Promise<void> {
    if (!srtPath) return
    setBusy('captions')
    setStatusMsg('Adding captions…')
    try {
      const out = await window.beam.burnCaptions(filePath, srtPath, {
        fontSize: captionFontSize,
        color: captionColor,
        position: captionPosition
      })
      setStatusMsg(`Saved with captions: ${out}`)
    } catch (err) {
      setStatusMsg(`Adding captions failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  const playheadPct = duration ? (current / duration) * 100 : 0
  const canSplit = segments.some(
    (s) => current > s.start + MIN_SEG_LEN && current < s.end - MIN_SEG_LEN
  )

  return (
    <div className="editor">
      <div className="editor__titlebar" />
      <div className="editor__top">
        <div className="editor__brand">
          <Logo size={22} />
          Beam Editor
        </div>
        <div className="editor__actions">
          <button className="btn btn-secondary" onClick={() => window.beam.reveal(filePath)}>
            <IconFolder width={15} height={15} /> Show in folder
          </button>
          <button className="btn btn-secondary" onClick={handleCopyFile}>
            {copied ? <IconCheck width={15} height={15} /> : <IconCopy width={15} height={15} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => window.beam.copyPath(filePath)}
            title="Copy file path as text"
          >
            Copy path
          </button>
          <button
            className="btn btn-ghost btn-icon"
            onClick={() => window.beam.openHome()}
            title="Close"
          >
            <IconX width={16} height={16} />
          </button>
        </div>
      </div>

      <div className="editor__stage">
        <div className="editor__video-wrap" ref={videoWrapRef}>
          <video
            ref={videoRef}
            src={toPlaybackUrl(filePath)}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
            onClick={cropMode ? undefined : togglePlay}
          />
          {cropMode && (
            <div className="crop-overlay">
              <div
                className="crop-overlay__mask"
                style={{ left: 0, top: 0, right: 0, height: `${cropRect.y * 100}%` }}
              />
              <div
                className="crop-overlay__mask"
                style={{
                  left: 0,
                  top: `${(cropRect.y + cropRect.h) * 100}%`,
                  right: 0,
                  bottom: 0
                }}
              />
              <div
                className="crop-overlay__mask"
                style={{
                  left: 0,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.x * 100}%`,
                  height: `${cropRect.h * 100}%`
                }}
              />
              <div
                className="crop-overlay__mask"
                style={{
                  left: `${(cropRect.x + cropRect.w) * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  right: 0,
                  height: `${cropRect.h * 100}%`
                }}
              />
              <div
                className="crop-overlay__box"
                onPointerDown={(e) => beginCropDrag('move', e)}
                style={{
                  left: `${cropRect.x * 100}%`,
                  top: `${cropRect.y * 100}%`,
                  width: `${cropRect.w * 100}%`,
                  height: `${cropRect.h * 100}%`
                }}
              >
                <div
                  className="crop-overlay__handle nw"
                  onPointerDown={(e) => beginCropDrag('nw', e)}
                />
                <div
                  className="crop-overlay__handle ne"
                  onPointerDown={(e) => beginCropDrag('ne', e)}
                />
                <div
                  className="crop-overlay__handle sw"
                  onPointerDown={(e) => beginCropDrag('sw', e)}
                />
                <div
                  className="crop-overlay__handle se"
                  onPointerDown={(e) => beginCropDrag('se', e)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="editor__bottom">
        <div className="editor__transport">
          <button className="btn btn-secondary btn-icon" onClick={togglePlay} disabled={cropMode}>
            {playing ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
          </button>
          <span className="editor__time">
            {formatTime(current)} / {formatTime(duration)}
          </span>
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleSplit}
            disabled={!canSplit || cropMode}
            title="Split at playhead (S)"
          >
            <IconScissors width={14} height={14} />
          </button>
          <div style={{ flex: 1 }} />
          {cropMode ? (
            <>
              <button
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={toggleCropMode}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy !== null}
                onClick={handleApplyCrop}
              >
                {busy === 'crop' ? <span className="spinner" /> : null} Save cropped copy
              </button>
            </>
          ) : (
            <>
              <button
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={toggleCropMode}
              >
                <IconCrop width={15} height={15} /> Crop
              </button>
              <button
                className="btn btn-secondary"
                disabled={busy !== null}
                onClick={handleTranscribe}
              >
                {busy === 'transcribe' ? <span className="spinner" /> : null} Transcribe
              </button>
              <button className="btn btn-secondary" disabled={busy !== null} onClick={handleGif}>
                {busy === 'gif' ? <span className="spinner" /> : <IconGif width={15} height={15} />}{' '}
                Export GIF
              </button>
              <button className="btn btn-primary" disabled={busy !== null} onClick={handleTrim}>
                {busy === 'trim' ? <span className="spinner" /> : null} Save trimmed copy
              </button>
            </>
          )}
        </div>

        {srtPath && (
          <div className="caption-panel">
            <span className="caption-panel__label">Captions</span>
            <select
              value={captionPosition}
              onChange={(e) => setCaptionPosition(e.target.value as CaptionStyle['position'])}
              title="Caption position"
            >
              <option value="bottom">Bottom</option>
              <option value="middle">Middle</option>
              <option value="top">Top</option>
            </select>
            <select
              value={captionFontSize}
              onChange={(e) => setCaptionFontSize(Number(e.target.value))}
              title="Caption size"
            >
              <option value={18}>Small</option>
              <option value={24}>Medium</option>
              <option value={32}>Large</option>
              <option value={42}>X-Large</option>
            </select>
            <input
              className="caption-panel__color"
              type="color"
              value={captionColor}
              onChange={(e) => setCaptionColor(e.target.value)}
              title="Caption color"
            />
            <div style={{ flex: 1 }} />
            <button
              className="btn btn-secondary"
              disabled={busy !== null}
              onClick={handleBurnCaptions}
            >
              {busy === 'captions' ? <span className="spinner" /> : null} Add captions to video
            </button>
          </div>
        )}

        <div className="trim-track" ref={trackRef} onClick={seekFromTrackClick}>
          {segments.map((seg, i) => {
            const leftPct = duration ? (seg.start / duration) * 100 : 0
            const widthPct = duration ? ((seg.end - seg.start) / duration) * 100 : 0
            return (
              <div
                key={i}
                className={`trim-track__selection ${selected === i ? 'selected' : ''}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              >
                {selected === i && segments.length > 1 && (
                  <button
                    className="trim-track__delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteSegment(i)
                    }}
                    title="Remove this segment"
                  >
                    <IconX width={11} height={11} />
                  </button>
                )}
                <div
                  className="trim-track__handle"
                  style={{ left: -6 }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    draggingRef.current = { index: i, edge: 'start' }
                    dragRectRef.current = trackRef.current?.getBoundingClientRect() ?? null
                  }}
                />
                <div
                  className="trim-track__handle"
                  style={{ right: -6 }}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    draggingRef.current = { index: i, edge: 'end' }
                    dragRectRef.current = trackRef.current?.getBoundingClientRect() ?? null
                  }}
                />
              </div>
            )
          })}
          <div className="trim-track__playhead" style={{ left: `${playheadPct}%` }} />
        </div>

        <div className="editor__status">
          {statusMsg ||
            (segments.length > 1
              ? `${segments.length} segments kept · S to split a clip, select + Delete to remove one`
              : '')}
        </div>
      </div>
    </div>
  )
}
