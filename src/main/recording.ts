import { BrowserWindow } from 'electron'
import { createControlBar, createWebcamBubble, createInputOverlay, getHomeWindow } from './windows'
import { recorderState, resetRecorderState, RecordingOptions } from './state'
import { startInputMonitor } from './inputMonitor'

export function isRecording(): boolean {
  return recorderState.options !== null
}

export async function beginRecording(options: RecordingOptions): Promise<void> {
  resetRecorderState()
  recorderState.options = options

  getHomeWindow()?.hide()
  const control = createControlBar()
  let webcam: BrowserWindow | null = null
  if (options.webcamEnabled) {
    webcam = createWebcamBubble()
  }
  // The overlay window renders visible ripples/keystrokes, so it's only
  // needed for those — auto-zoom just needs uiohook running to log click
  // timestamps, with no on-screen presence of its own.
  if (options.showClicks || options.showKeystrokes) {
    createInputOverlay()
  }
  if (options.showClicks || options.showKeystrokes || options.autoZoom) {
    startInputMonitor({
      showClicks: !!options.showClicks,
      showKeystrokes: !!options.showKeystrokes,
      autoZoom: !!options.autoZoom
    })
  }

  const begin = (): void => {
    control.webContents.send('recording:begin', options)
    webcam?.webContents.send('recording:begin', options)
  }
  if (webcam) {
    let ready = 0
    const onReady = (): void => {
      ready += 1
      if (ready >= 2) begin()
    }
    control.webContents.once('did-finish-load', onReady)
    webcam.webContents.once('did-finish-load', onReady)
  } else {
    control.webContents.once('did-finish-load', begin)
  }
}
