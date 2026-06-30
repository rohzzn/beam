export type Quality = 'standard' | 'high' | 'maximum'

export interface RecordingOptions {
  sourceId: string
  sourceName: string
  micEnabled: boolean
  micDeviceId?: string
  systemAudio: boolean
  webcamEnabled: boolean
  webcamDeviceId?: string
  quality: Quality
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
