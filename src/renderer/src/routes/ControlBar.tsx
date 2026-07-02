import { useEffect, useRef, useState } from 'react'
import type { RecordingOptions } from '../../../preload/index'
import {
  buildMixedStream,
  createRecorder,
  getMicStream,
  getScreenStream,
  stopAllTracks
} from '../lib/recorder'
import { startLiveCaptionCapture } from '../lib/liveCaption'
import { getVideoBitsPerSecond } from '../lib/quality'
import { IconPause, IconPlay, IconSquare } from '../components/Icons'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** The Stop button is disabled while still waiting for the sync handshake
 *  in recording.ts to fire "go", but the global hotkey and the OS-level
 *  "stop sharing" indicator both call handleStop() directly, bypassing
 *  that. A MediaRecorder that was prepared but never started is still
 *  "inactive" — calling stop() on it throws InvalidStateError instead of
 *  quietly no-op'ing. */
function safeStop(recorder: MediaRecorder | null): void {
  if (recorder && recorder.state !== 'inactive') recorder.stop()
}

export default function ControlBar(): React.JSX.Element {
  const [status, setStatus] = useState<'starting' | 'recording' | 'paused' | 'stopping'>('starting')
  const [elapsed, setElapsed] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamsRef = useRef<MediaStream[]>([])
  const audioCtxRef = useRef<AudioContext | null>(null)
  const tickRef = useRef<number | null>(null)
  const micRecorderRef = useRef<MediaRecorder | null>(null)
  const micChunksRef = useRef<Blob[]>([])
  const stopLiveCaptionsRef = useRef<(() => void) | null>(null)

  function handleStop(): void {
    setStatus((prev) => {
      if (prev === 'stopping') return prev
      stopLiveCaptionsRef.current?.()
      stopLiveCaptionsRef.current = null
      if (prev === 'starting') {
        // The sync handshake in recording.ts never reached "go" — both
        // recorders are still "inactive" (prepared, never started), so
        // there's nothing recorded to stop and finalize; this is really a
        // cancel. Because they were never started, their onstop handlers
        // (which normally release the underlying tracks) will never fire,
        // so release the tracks directly instead of leaking an open
        // mic/screen-share indicator.
        stopAllTracks(...streamsRef.current)
        audioCtxRef.current?.close()
        window.beam.cancelRecording()
        return 'stopping'
      }
      window.beam.sendControlEvent('stop')
      safeStop(recorderRef.current)
      safeStop(micRecorderRef.current)
      return 'stopping'
    })
  }

  async function begin(options: RecordingOptions): Promise<void> {
    try {
      const screenStream = await getScreenStream(options.systemAudio)
      streamsRef.current.push(screenStream)

      const audioSources: MediaStream[] = []
      if (screenStream.getAudioTracks().length > 0) audioSources.push(screenStream)
      // Mic access is best-effort: no microphone, a denied permission, or a
      // saved device that no longer exists must never take down the whole
      // recording. Losing mic audio is a degraded-but-usable outcome; losing
      // the entire recording over it is not.
      let micStream: MediaStream | null = null
      if (options.micEnabled) {
        try {
          micStream = await getMicStream(options.micDeviceId)
          streamsRef.current.push(micStream)
          audioSources.push(micStream)
        } catch (err) {
          console.error('[beam] mic unavailable, recording without it', err)
          window.beam.notifyMicUnavailable()
        }
      } else {
        window.beam.notifyMicUnavailable()
      }

      const videoTrack = screenStream.getVideoTracks()[0] ?? null
      const { stream: mixed, audioContext } = buildMixedStream(videoTrack, audioSources)
      audioCtxRef.current = audioContext

      const recorder = createRecorder(mixed, getVideoBitsPerSecond(options.quality))
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const buffer = await blob.arrayBuffer()
        stopAllTracks(...streamsRef.current)
        audioCtxRef.current?.close()
        await window.beam.submitScreenBuffer(buffer)
      }
      recorderRef.current = recorder

      // The mic gets mixed into the same track as system audio above for
      // the final video, which makes the two impossible to separate again
      // afterwards. Transcription needs just the user's voice — recording
      // the mic a second time, independently, is the only way to keep an
      // isolated copy for that without touching the final video's audio.
      // This is purely a transcription nicety, so any failure here must
      // degrade gracefully rather than take down the real recording —
      // main process is told either way so it never waits on a buffer
      // that was never coming.
      if (micStream) {
        try {
          const micRecorder = new MediaRecorder(new MediaStream(micStream.getAudioTracks()), {
            mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ? 'audio/webm;codecs=opus'
              : 'audio/webm'
          })
          micChunksRef.current = []
          micRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) micChunksRef.current.push(e.data)
          }
          micRecorder.onstop = async () => {
            const blob = new Blob(micChunksRef.current, { type: micRecorder.mimeType })
            const buffer = await blob.arrayBuffer()
            await window.beam.submitMicBuffer(buffer)
          }
          micRecorderRef.current = micRecorder
        } catch (err) {
          console.error(
            '[beam] mic-only capture failed to start, transcription will fall back',
            err
          )
          window.beam.notifyMicUnavailable()
        }
      } else {
        window.beam.notifyMicUnavailable()
      }

      // Same best-effort treatment as everything else optional here — live
      // captions failing to start must never affect the actual recording.
      // Unlike the two recorders above, this doesn't wait for the "go"
      // signal below — a few hundred ms of offset doesn't matter for a
      // rough background transcript, and starting it as early as possible
      // only helps it get further ahead by the time recording ends.
      if (micStream && options.liveCaptions) {
        try {
          stopLiveCaptionsRef.current = startLiveCaptionCapture(micStream)
        } catch (err) {
          console.error('[beam] live captions failed to start', err)
        }
      }

      // If the user stops sharing from the OS-level indicator, end gracefully.
      videoTrack?.addEventListener('ended', () => handleStop())

      // Stream + both MediaRecorders are fully prepared but deliberately
      // not started yet — see recording.ts for why this waits for main's
      // synchronized "go" instead of just calling start() right here.
      window.beam.notifyStreamReady()
    } catch (err) {
      console.error('Failed to start recording', err)
      await window.beam.cancelRecording((err as Error).message || 'Could not start recording')
    }
  }

  function handlePauseResume(): void {
    const recorder = recorderRef.current
    if (!recorder) return
    if (status === 'recording') {
      recorder.pause()
      micRecorderRef.current?.pause()
      window.beam.sendControlEvent('pause')
      setStatus('paused')
    } else if (status === 'paused') {
      recorder.resume()
      micRecorderRef.current?.resume()
      window.beam.sendControlEvent('resume')
      setStatus('recording')
    }
  }

  useEffect(() => {
    const offBegin = window.beam.onRecordingBegin((options) => begin(options))
    const offGo = window.beam.onRecordingGo(() => {
      recorderRef.current?.start(1000)
      micRecorderRef.current?.start(1000)
      setStatus('recording')
    })
    const offRemoteStop = window.beam.onRemoteStop(() => handleStop())
    return () => {
      offBegin()
      offGo()
      offRemoteStop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (status === 'recording') {
      tickRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000)
    } else if (tickRef.current) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [status])

  return (
    <div className="control-bar">
      <div className="control-bar__rec">
        <span className={`control-bar__dot ${status === 'paused' ? 'paused' : ''}`} />
        <span className="control-bar__time">{formatTime(elapsed)}</span>
      </div>
      <div className="control-bar__spacer" />
      <div className="control-bar__actions">
        <button
          className="btn btn-secondary btn-icon"
          onClick={handlePauseResume}
          disabled={status === 'starting' || status === 'stopping'}
          title={status === 'paused' ? 'Resume' : 'Pause'}
        >
          {status === 'paused' ? (
            <IconPlay width={15} height={15} />
          ) : (
            <IconPause width={15} height={15} />
          )}
        </button>
        <button
          className="btn btn-danger btn-icon"
          onClick={handleStop}
          disabled={status === 'starting' || status === 'stopping'}
          title="Stop"
        >
          <IconSquare width={14} height={14} />
        </button>
      </div>
    </div>
  )
}
