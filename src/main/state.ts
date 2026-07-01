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
  autoZoom?: boolean
}

/** A click captured during recording for the auto-zoom pass, timestamped
 *  relative to when the screen capture actually started (not wall-clock),
 *  so it lines up with the recorded video's own timeline regardless of how
 *  long window/IPC setup took before capture began. */
export interface ClickEvent {
  time: number
  xFrac: number
  yFrac: number
}

interface RecorderState {
  options: RecordingOptions | null
  screenBufferPath: string | null
  webcamBufferPath: string | null
  captureStartedAt: number | null
  clickEvents: ClickEvent[]
}

export const recorderState: RecorderState = {
  options: null,
  screenBufferPath: null,
  webcamBufferPath: null,
  captureStartedAt: null,
  clickEvents: []
}

export function resetRecorderState(): void {
  recorderState.options = null
  recorderState.screenBufferPath = null
  recorderState.webcamBufferPath = null
  recorderState.captureStartedAt = null
  recorderState.clickEvents = []
}
