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

      // Prepared but deliberately not started yet — see recording.ts for
      // why this waits for main's synchronized "go" instead of just
      // calling start() right here. Without that wait, the webcam (camera
      // hardware usually takes noticeably longer to power up than screen
      // capture does) would start recording however many hundred ms later
      // than the screen+audio side, which is exactly what showed up as the
      // webcam — and the mic audio riding along with the screen recording —
      // drifting out of sync with what's actually on screen.
      window.beam.notifyStreamReady()
    } catch (err) {
      console.error('Failed to start webcam recording', err)
      // A failed camera must never leave main waiting forever for a ready
      // signal (the sync handshake) or a webcam buffer (finalize) that are
      // never coming — the recording continues without the bubble instead.
      window.beam.notifyWebcamUnavailable()
      window.beam.notifyStreamReady()
    }
  }

  useEffect(() => {
    const offBegin = window.beam.onRecordingBegin((options) => begin(options))
    const offGo = window.beam.onRecordingGo(() => {
      recorderRef.current?.start(1000)
    })
    const offControl = window.beam.onControlEvent((payload) => {
      const recorder = recorderRef.current
      if (!recorder) return
      if (payload.type === 'pause') recorder.pause()
      if (payload.type === 'resume') recorder.resume()
      if (payload.type === 'stop') recorder.stop()
    })
    return () => {
      offBegin()
      offGo()
      offControl()
    }
  }, [])

  function handleWheel(e: React.WheelEvent): void {
    // Scroll to resize: a frameless transparent window has no visible OS
    // resize handle to grab, so this is the bubble's only resize affordance
    // besides whatever sliver of edge-dragging Windows still allows.
    window.beam.resizeWebcamBubble(e.deltaY < 0 ? 12 : -12)
  }

  return (
    <div className="webcam-bubble" onWheel={handleWheel}>
      <video ref={videoRef} autoPlay muted playsInline />
      {!ready && <div className="webcam-bubble__placeholder">Camera…</div>}
    </div>
  )
}
