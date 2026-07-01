import { useEffect, useRef, useState } from 'react'
import { toPlaybackUrl } from '../lib/fileUrl'
import type { CaptionStyle, TrimSegment } from '../../../preload/index'
import {
  IconCheck,
  IconCopy,
  IconFolder,
  IconGif,
  IconPause,
  IconPlay,
  IconScissors,
  IconX
} from '../components/Icons'
import Logo from '../components/Logo'

const MIN_SEG_LEN = 0.2

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Editor({
  filePath,
  micPath
}: {
  filePath: string
  micPath?: string | null
}): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<{ index: number; edge: 'start' | 'end' } | null>(null)
  const dragRectRef = useRef<DOMRect | null>(null)
  const pendingXRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)

  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [segments, setSegments] = useState<TrimSegment[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState<'trim' | 'gif' | 'transcribe' | 'captions' | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [copied, setCopied] = useState(false)

  const [srtPath, setSrtPath] = useState<string | null>(null)
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
        <video
          ref={videoRef}
          src={toPlaybackUrl(filePath)}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onClick={togglePlay}
        />
      </div>

      <div className="editor__bottom">
        <div className="editor__transport">
          <button className="btn btn-secondary btn-icon" onClick={togglePlay}>
            {playing ? <IconPause width={15} height={15} /> : <IconPlay width={15} height={15} />}
          </button>
          <span className="editor__time">
            {formatTime(current)} / {formatTime(duration)}
          </span>
          <button
            className="btn btn-secondary btn-icon"
            onClick={handleSplit}
            disabled={!canSplit}
            title="Split at playhead (S)"
          >
            <IconScissors width={14} height={14} />
          </button>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary" disabled={busy !== null} onClick={handleTranscribe}>
            {busy === 'transcribe' ? <span className="spinner" /> : null} Transcribe
          </button>
          <button className="btn btn-secondary" disabled={busy !== null} onClick={handleGif}>
            {busy === 'gif' ? <span className="spinner" /> : <IconGif width={15} height={15} />}{' '}
            Export GIF
          </button>
          <button className="btn btn-primary" disabled={busy !== null} onClick={handleTrim}>
            {busy === 'trim' ? <span className="spinner" /> : null} Save trimmed copy
          </button>
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
