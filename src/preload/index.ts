import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export type Quality = 'standard' | 'high' | 'maximum'

export interface RegionRect {
  xFrac: number
  yFrac: number
  wFrac: number
  hFrac: number
}

export interface TrimSegment {
  start: number
  end: number
}

export interface CaptionStyle {
  fontSize: number
  color: string
  position: 'top' | 'middle' | 'bottom'
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

export interface SourceInfo {
  id: string
  name: string
  type: 'screen' | 'window'
  thumbnail: string
  appIcon: string | null
}

export interface RecordingPrefs {
  micEnabled: boolean
  micDeviceId?: string
  webcamEnabled: boolean
  webcamDeviceId?: string
  systemAudio: boolean
  quality: Quality
  showClicks: boolean
  showKeystrokes: boolean
}

export interface BeamSettings {
  outputDir: string | null
  hotkeyEnabled: boolean
  startStopHotkey: string
  recordingPrefs: RecordingPrefs
}

const api = {
  listSources: (): Promise<SourceInfo[]> => ipcRenderer.invoke('sources:list'),
  startRecording: (options: RecordingOptions): Promise<void> =>
    ipcRenderer.invoke('recording:start', options),
  sendControlEvent: (type: 'pause' | 'resume' | 'stop'): void =>
    ipcRenderer.send('recording:control-event', { type }),
  resizeWebcamBubble: (deltaPx: number): void => ipcRenderer.send('webcam:resize', deltaPx),
  submitScreenBuffer: (buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:submit-screen', buffer),
  submitWebcamBuffer: (buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:submit-webcam', buffer),
  submitMicBuffer: (buffer: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke('recording:submit-mic', buffer),
  notifyMicUnavailable: (): void => ipcRenderer.send('recording:mic-unavailable'),
  cancelRecording: (reason?: string): Promise<void> =>
    ipcRenderer.invoke('recording:cancel', reason),
  onRecordingBegin: (cb: (options: RecordingOptions) => void): (() => void) => {
    const listener = (_evt: unknown, options: RecordingOptions): void => cb(options)
    ipcRenderer.on('recording:begin', listener)
    return () => ipcRenderer.removeListener('recording:begin', listener)
  },
  onRecordingFailed: (cb: (reason: string) => void): (() => void) => {
    const listener = (_evt: unknown, reason: string): void => cb(reason)
    ipcRenderer.on('recording:failed', listener)
    return () => ipcRenderer.removeListener('recording:failed', listener)
  },
  onControlEvent: (cb: (payload: { type: 'pause' | 'resume' | 'stop' }) => void): (() => void) => {
    const listener = (_evt: unknown, payload: { type: 'pause' | 'resume' | 'stop' }): void =>
      cb(payload)
    ipcRenderer.on('recording:control-event', listener)
    return () => ipcRenderer.removeListener('recording:control-event', listener)
  },
  trim: (filePath: string, segments: TrimSegment[]): Promise<string> =>
    ipcRenderer.invoke('editor:trim', { filePath, segments }),
  burnCaptions: (filePath: string, srtPath: string, style: CaptionStyle): Promise<string> =>
    ipcRenderer.invoke('editor:burnCaptions', { filePath, srtPath, style }),
  exportGif: (filePath: string, segments: TrimSegment[]): Promise<string> =>
    ipcRenderer.invoke('editor:exportGif', { filePath, segments }),
  reveal: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:reveal', filePath),
  copyPath: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:copyPath', filePath),
  copyFile: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:copyFile', filePath),
  openHome: (): Promise<void> => ipcRenderer.invoke('editor:openHome'),
  transcribe: (
    filePath: string,
    micPath?: string
  ): Promise<{ text: string; srtPath: string | null }> =>
    ipcRenderer.invoke('transcription:run', filePath, micPath),
  getVideosDir: (): Promise<string> => ipcRenderer.invoke('app:getVideosDir'),

  getSettings: (): Promise<BeamSettings> => ipcRenderer.invoke('settings:get'),
  saveRecordingPrefs: (prefs: RecordingPrefs): Promise<BeamSettings> =>
    ipcRenderer.invoke('settings:saveRecordingPrefs', prefs),
  setHotkey: (enabled: boolean, accelerator: string): Promise<BeamSettings> =>
    ipcRenderer.invoke('settings:setHotkey', { enabled, accelerator }),
  chooseOutputDir: (): Promise<string | null> => ipcRenderer.invoke('settings:chooseOutputDir'),
  resetOutputDir: (): Promise<string | null> => ipcRenderer.invoke('settings:resetOutputDir'),

  onRemoteStop: (cb: () => void): (() => void) => {
    const listener = (): void => cb()
    ipcRenderer.on('recording:remote-stop', listener)
    return () => ipcRenderer.removeListener('recording:remote-stop', listener)
  },

  selectRegion: (): Promise<RegionRect | null> => ipcRenderer.invoke('region:select'),
  submitRegionResult: (rect: RegionRect | null): void => ipcRenderer.send('region:result', rect),

  onInputClick: (cb: (pos: { x: number; y: number }) => void): (() => void) => {
    const listener = (_evt: unknown, pos: { x: number; y: number }): void => cb(pos)
    ipcRenderer.on('input:click', listener)
    return () => ipcRenderer.removeListener('input:click', listener)
  },
  onInputKey: (cb: (label: string) => void): (() => void) => {
    const listener = (_evt: unknown, label: string): void => cb(label)
    ipcRenderer.on('input:key', listener)
    return () => ipcRenderer.removeListener('input:key', listener)
  }
}

export type BeamAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('beam', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.beam = api
}
