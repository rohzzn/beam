import { BrowserWindow, ipcMain } from 'electron'
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

  // Any listener left over from a prior recording that got cancelled before
  // reaching its own "go" (so it never cleaned itself up) would otherwise
  // pile up here indefinitely — this channel only ever means anything
  // during the single start sequence about to begin, so a clean slate is
  // always correct.
  ipcMain.removeAllListeners('recording:ready-to-start')

  const begin = (): void => {
    control.webContents.send('recording:begin', options)
    webcam?.webContents.send('recording:begin', options)
  }
  if (webcam) {
    let loaded = 0
    const onLoaded = (): void => {
      loaded += 1
      if (loaded >= 2) begin()
    }
    control.webContents.once('did-finish-load', onLoaded)
    webcam.webContents.once('did-finish-load', onLoaded)
  } else {
    control.webContents.once('did-finish-load', begin)
  }

  // Screen capture and webcam capture are two independently-initializing
  // MediaRecorders in two separate renderer windows. Camera hardware can
  // take far longer to power up than screen capture does, and until now
  // nothing accounted for that — each side just called MediaRecorder.start()
  // whenever its own async setup happened to finish, which is exactly what
  // showed up as the webcam (and the mic audio riding along with the screen
  // recorder) drifting out of sync with what's actually on screen. Both
  // windows now fully prepare their stream + MediaRecorder and then wait —
  // main only broadcasts the synchronized "go" once every window that's
  // actually recording (control always, webcam only if enabled) has
  // confirmed it's ready, so both start() calls land within milliseconds of
  // each other instead of however far apart their hardware init happened to
  // land.
  const expectedReady = webcam ? 2 : 1
  let readyCount = 0
  const onStreamReady = (): void => {
    readyCount += 1
    if (readyCount >= expectedReady) {
      ipcMain.removeListener('recording:ready-to-start', onStreamReady)
      control.webContents.send('recording:go')
      webcam?.webContents.send('recording:go')
    }
  }
  ipcMain.on('recording:ready-to-start', onStreamReady)
}
