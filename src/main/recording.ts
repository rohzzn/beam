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
  if (options.showClicks || options.showKeystrokes) {
    createInputOverlay()
    startInputMonitor({
      showClicks: !!options.showClicks,
      showKeystrokes: !!options.showKeystrokes
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
