import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

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
  cancelRecording: (): Promise<void> => ipcRenderer.invoke('recording:cancel'),
  onRecordingBegin: (cb: (options: RecordingOptions) => void): (() => void) => {
    const listener = (_evt: unknown, options: RecordingOptions): void => cb(options)
    ipcRenderer.on('recording:begin', listener)
    return () => ipcRenderer.removeListener('recording:begin', listener)
  },
  onControlEvent: (cb: (payload: { type: 'pause' | 'resume' | 'stop' }) => void): (() => void) => {
    const listener = (_evt: unknown, payload: { type: 'pause' | 'resume' | 'stop' }): void =>
      cb(payload)
    ipcRenderer.on('recording:control-event', listener)
    return () => ipcRenderer.removeListener('recording:control-event', listener)
  },
  trim: (filePath: string, start: number, end: number): Promise<string> =>
    ipcRenderer.invoke('editor:trim', { filePath, start, end }),
  exportGif: (filePath: string, start: number, end: number): Promise<string> =>
    ipcRenderer.invoke('editor:exportGif', { filePath, start, end }),
  reveal: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:reveal', filePath),
  copyPath: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:copyPath', filePath),
  copyFile: (filePath: string): Promise<void> => ipcRenderer.invoke('editor:copyFile', filePath),
  openHome: (): Promise<void> => ipcRenderer.invoke('editor:openHome'),
  transcribe: (filePath: string): Promise<{ text: string; srtPath: string | null }> =>
    ipcRenderer.invoke('transcription:run', filePath),
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
