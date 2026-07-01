import { useEffect, useRef, useState } from 'react'
import type { RecordingOptions } from '../../../preload/index'
import {
  buildMixedStream,
  createRecorder,
  getMicStream,
  getScreenStream,
  stopAllTracks
} from '../lib/recorder'
import { getVideoBitsPerSecond } from '../lib/quality'
import { IconPause, IconPlay, IconSquare } from '../components/Icons'

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
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

  function handleStop(): void {
    setStatus((prev) => {
      if (prev === 'stopping') return prev
      window.beam.sendControlEvent('stop')
      recorderRef.current?.stop()
      micRecorderRef.current?.stop()
      return 'stopping'
    })
  }

  async function begin(options: RecordingOptions): Promise<void> {
    try {
      const screenStream = await getScreenStream(options.systemAudio)
      streamsRef.current.push(screenStream)

      const audioSources: MediaStream[] = []
      if (screenStream.getAudioTracks().length > 0) audioSources.push(screenStream)
      let micStream: MediaStream | null = null
      if (options.micEnabled) {
        micStream = await getMicStream(options.micDeviceId)
        streamsRef.current.push(micStream)
        audioSources.push(micStream)
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
      if (micStream) {
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
        micRecorder.start(1000)
      }

      recorder.start(1000)
      setStatus('recording')

      // If the user stops sharing from the OS-level indicator, end gracefully.
      videoTrack?.addEventListener('ended', () => handleStop())
    } catch (err) {
      console.error('Failed to start recording', err)
      await window.beam.cancelRecording()
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
    const offRemoteStop = window.beam.onRemoteStop(() => handleStop())
    return () => {
      offBegin()
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
