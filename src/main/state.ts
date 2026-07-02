export type Quality = 'standard' | 'high' | 'maximum'

/** A user-drawn capture region, expressed as 0..1 fractions of the source
 *  display's bounds rather than absolute pixels — resolved against the
 *  actual encoded frame size at ffmpeg time (via in_w/in_h), so it stays
 *  correct regardless of DPI scaling differences between Electron's
 *  logical display coordinates and the real captured pixel resolution. */
export interface RegionRect {
  xFrac: number
  yFrac: number
  wFrac: number
  hFrac: number
}

export interface RecordingOptions {
  sourceId: string
  sourceName: string
  micEnabled: boolean
  micDeviceId?: string
  systemAudio: boolean
  webcamEnabled: boolean
  webcamDeviceId?: string
  quality: Quality
  region?: RegionRect
  showClicks?: boolean
  showKeystrokes?: boolean
  liveCaptions?: boolean
}

interface RecorderState {
  options: RecordingOptions | null
  screenBufferPath: string | null
  webcamBufferPath: string | null
  /** Independent mic-only recording, captured in parallel with the main
   *  (mic+system-audio-mixed) track solely so transcription has a copy of
   *  just the user's voice. Not deleted by the normal temp-file cleanup —
   *  it's handed off to the editor window for on-demand transcription and
   *  cleaned up after that runs (or swept on next app launch). */
  micBufferPath: string | null
  /** Set when the renderer couldn't start (or lost) the mic-only capture —
   *  e.g. no microphone, permission denied, or the saved device disappeared.
   *  Without this, finalize would wait forever for a mic buffer that's
   *  never coming, since a plain `!micBufferPath` check can't tell "still
   *  recording" apart from "never going to happen." Mic-only capture is
   *  strictly a transcription nicety — it must never block the actual
   *  screen recording from finishing. */
  micUnavailable: boolean
  /** Same idea as micUnavailable, for the webcam bubble — e.g. the camera
   *  failed to open. Without this, both the sync handshake in recording.ts
   *  and the finalize gate below would wait forever for a webcam that's
   *  never coming. */
  webcamUnavailable: boolean
}

export const recorderState: RecorderState = {
  options: null,
  screenBufferPath: null,
  webcamBufferPath: null,
  micBufferPath: null,
  micUnavailable: false,
  webcamUnavailable: false
}

export function resetRecorderState(): void {
  recorderState.options = null
  recorderState.screenBufferPath = null
  recorderState.webcamBufferPath = null
  recorderState.micBufferPath = null
  recorderState.micUnavailable = false
  recorderState.webcamUnavailable = false
}
