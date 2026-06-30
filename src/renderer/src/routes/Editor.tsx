import { useEffect, useRef, useState } from 'react'
import { toPlaybackUrl } from '../lib/fileUrl'
import { IconCopy, IconFolder, IconGif, IconPause, IconPlay, IconX } from '../components/Icons'
import Logo from '../components/Logo'

function formatTime(seconds: number): string {
  if (!isFinite(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Editor({ filePath }: { filePath: string }): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)

  const [duration, setDuration] = useState(0)
  const [current, setCurrent] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState<'trim' | 'gif' | 'transcribe' | null>(null)
  const [statusMsg, setStatusMsg] = useState('')

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      const dragging = draggingRef.current
      if (!dragging || !trackRef.current || duration === 0) return
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
      const time = ratio * duration
      if (dragging === 'start') {
        setTrimStart(Math.min(time, trimEnd - 0.2))
      } else {
        setTrimEnd(Math.max(time, trimStart + 0.2))
      }
    }
    function onUp(): void {
      draggingRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [duration, trimStart, trimEnd])

  function handleLoadedMetadata(): void {
    const d = videoRef.current?.duration ?? 0
    setDuration(d)
    setTrimEnd(d)
  }

  function togglePlay(): void {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      if (video.currentTime < trimStart || video.currentTime >= trimEnd) {
        video.currentTime = trimStart
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
    setCurrent(video.currentTime)
    if (video.currentTime >= trimEnd) {
      video.pause()
      setPlaying(false)
    }
  }

  function seekFromTrackClick(e: React.MouseEvent): void {
    if (!trackRef.current || duration === 0) return
    const rect = trackRef.current.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    const time = ratio * duration
    if (videoRef.current) videoRef.current.currentTime = time
    setCurrent(time)
  }

  async function handleTrim(): Promise<void> {
    setBusy('trim')
    setStatusMsg('Exporting trimmed copy…')
    try {
      const out = await window.beam.trim(filePath, trimStart, trimEnd)
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
      const out = await window.beam.exportGif(filePath, trimStart, trimEnd)
      setStatusMsg(`Saved GIF: ${out}`)
    } catch (err) {
      setStatusMsg(`GIF export failed: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  async function handleTranscribe(): Promise<void> {
    setBusy('transcribe')
    setStatusMsg('Transcribing…')
    try {
      const res = await window.beam.transcribe(filePath)
      setStatusMsg(res.text || 'No speech detected.')
    } catch (err) {
      setStatusMsg(`Transcription isn't set up yet (${(err as Error).message})`)
    } finally {
      setBusy(null)
    }
  }

  const startPct = duration ? (trimStart / duration) * 100 : 0
  const endPct = duration ? (trimEnd / duration) * 100 : 100
  const playheadPct = duration ? (current / duration) * 100 : 0

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
          <button className="btn btn-secondary" onClick={() => window.beam.copyPath(filePath)}>
            <IconCopy width={15} height={15} /> Copy path
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

        <div className="trim-track" ref={trackRef} onClick={seekFromTrackClick}>
          <div
            className="trim-track__selection"
            style={{ left: `${startPct}%`, width: `${endPct - startPct}%` }}
          />
          <div
            className="trim-track__handle"
            style={{ left: `calc(${startPct}% - 6px)` }}
            onPointerDown={(e) => {
              e.stopPropagation()
              draggingRef.current = 'start'
            }}
          />
          <div
            className="trim-track__handle"
            style={{ left: `calc(${endPct}% - 6px)` }}
            onPointerDown={(e) => {
              e.stopPropagation()
              draggingRef.current = 'end'
            }}
          />
          <div className="trim-track__playhead" style={{ left: `${playheadPct}%` }} />
        </div>

        <div className="editor__status">{statusMsg}</div>
      </div>
    </div>
  )
}
