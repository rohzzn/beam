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

const api = {
  listSources: (): Promise<SourceInfo[]> => ipcRenderer.invoke('sources:list'),
  startRecording: (options: RecordingOptions): Promise<void> =>
    ipcRenderer.invoke('recording:start', options),
  sendControlEvent: (type: 'pause' | 'resume' | 'stop'): void =>
    ipcRenderer.send('recording:control-event', { type }),
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
  openHome: (): Promise<void> => ipcRenderer.invoke('editor:openHome'),
  transcribe: (filePath: string): Promise<{ text: string; srtPath: string | null }> =>
    ipcRenderer.invoke('transcription:run', filePath),
  getVideosDir: (): Promise<string> => ipcRenderer.invoke('app:getVideosDir')
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
