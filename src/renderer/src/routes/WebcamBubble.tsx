import { useEffect, useRef, useState } from 'react'
import type { RecordingOptions } from '../../../preload/index'
import { createRecorder, getWebcamStream, stopAllTracks } from '../lib/recorder'

export default function WebcamBubble(): React.JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [ready, setReady] = useState(false)

  async function begin(options: RecordingOptions): Promise<void> {
    try {
      const stream = await getWebcamStream(options.webcamDeviceId)
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play().catch(() => {})
      }
      setReady(true)

      const recorder = createRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
        const buffer = await blob.arrayBuffer()
        stopAllTracks(streamRef.current)
        await window.beam.submitWebcamBuffer(buffer)
      }
      recorderRef.current = recorder
      recorder.start(1000)
    } catch (err) {
      console.error('Failed to start webcam recording', err)
    }
  }

  useEffect(() => {
    const offBegin = window.beam.onRecordingBegin((options) => begin(options))
    const offControl = window.beam.onControlEvent((payload) => {
      const recorder = recorderRef.current
      if (!recorder) return
      if (payload.type === 'pause') recorder.pause()
      if (payload.type === 'resume') recorder.resume()
      if (payload.type === 'stop') recorder.stop()
    })
    return () => {
      offBegin()
      offControl()
    }
  }, [])

  return (
    <div className="webcam-bubble">
      <video ref={videoRef} autoPlay muted playsInline />
      {!ready && <div className="webcam-bubble__placeholder">Camera…</div>}
    </div>
  )
}
