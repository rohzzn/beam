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
}

interface RecorderState {
  options: RecordingOptions | null
  screenBufferPath: string | null
  webcamBufferPath: string | null
}

export const recorderState: RecorderState = {
  options: null,
  screenBufferPath: null,
  webcamBufferPath: null
}

export function resetRecorderState(): void {
  recorderState.options = null
  recorderState.screenBufferPath = null
  recorderState.webcamBufferPath = null
}
