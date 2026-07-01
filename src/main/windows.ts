import { BrowserWindow, screen, ipcMain } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import type { RegionRect } from './state'

function rendererURL(hash: string): string {
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}#${hash}`
  }
  return `file://${join(__dirname, '../renderer/index.html')}#${hash}`
}

function load(win: BrowserWindow, hash: string): void {
  win.loadURL(rendererURL(hash))
}

const preload = join(__dirname, '../preload/index.js')

let homeWindow: BrowserWindow | null = null
let controlWindow: BrowserWindow | null = null
let webcamWindow: BrowserWindow | null = null
let editorWindow: BrowserWindow | null = null
let inputOverlayWindow: BrowserWindow | null = null

export function getHomeWindow(): BrowserWindow | null {
  return homeWindow
}
export function getControlWindow(): BrowserWindow | null {
  return controlWindow
}
export function getWebcamWindow(): BrowserWindow | null {
  return webcamWindow
}
export function getEditorWindow(): BrowserWindow | null {
  return editorWindow
}
export function getInputOverlay(): BrowserWindow | null {
  return inputOverlayWindow
}

export function createHomeWindow(): BrowserWindow {
  if (homeWindow && !homeWindow.isDestroyed()) {
    homeWindow.show()
    homeWindow.focus()
    return homeWindow
  }
  homeWindow = new BrowserWindow({
    width: 380,
    height: 720,
    minWidth: 340,
    minHeight: 560,
    show: false,
    resizable: true,
    icon,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 36 },
    backgroundColor: '#000000',
    webPreferences: { preload, sandbox: false }
  })
  homeWindow.on('ready-to-show', () => homeWindow?.show())
  homeWindow.on('closed', () => {
    homeWindow = null
  })
  load(homeWindow, '/')
  return homeWindow
}

export function createControlBar(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const width = 360
  const height = 64
  const x = Math.round(display.workArea.x + (display.workArea.width - width) / 2)
  const y = display.workArea.y + 20

  controlWindow = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    // Windows' DWM compositor needs an explicit fully-transparent backing
    // color for a frameless transparent window — leaving it unset produces a
    // faint hard-edged rectangular fringe around rounded/circular CSS shapes
    // (the "pill/circle edges aren't cut off properly" artifact), because it
    // falls back to an opaque default before the first paint defines it.
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  controlWindow.setAlwaysOnTop(true, 'screen-saver')
  controlWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  controlWindow.setContentProtection(true)
  controlWindow.on('ready-to-show', () => controlWindow?.show())
  controlWindow.on('closed', () => {
    controlWindow = null
  })
  load(controlWindow, '/control')
  return controlWindow
}

/** Fullscreen overlay for click ripples / keystroke badges. Unlike the
 *  control bar and webcam bubble, this one deliberately has NO content
 *  protection — the whole point is for it to show up in the recording.
 *  Click-through (ignoreMouseEvents) so it never intercepts real input. */
export function createInputOverlay(): BrowserWindow {
  const display = screen.getPrimaryDisplay()

  inputOverlayWindow = new BrowserWindow({
    x: display.bounds.x,
    y: display.bounds.y,
    width: display.bounds.width,
    height: display.bounds.height,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focusable: false,
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  inputOverlayWindow.setAlwaysOnTop(true, 'screen-saver')
  inputOverlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  inputOverlayWindow.setIgnoreMouseEvents(true, { forward: true })
  inputOverlayWindow.on('ready-to-show', () => inputOverlayWindow?.show())
  inputOverlayWindow.on('closed', () => {
    inputOverlayWindow = null
  })
  load(inputOverlayWindow, '/input-overlay')
  return inputOverlayWindow
}

const WEBCAM_MIN_SIZE = 120
const WEBCAM_MAX_SIZE = 440

/** Proportional to the primary display rather than a fixed pixel size, so
 *  the bubble doesn't look tiny on a 4K capture or oversized on a small
 *  one. Most recordings are of the primary display; for other sources this
 *  is still a reasonable default the user can resize anyway. */
function defaultWebcamSize(): number {
  const { height } = screen.getPrimaryDisplay().workAreaSize
  return Math.round(Math.min(WEBCAM_MAX_SIZE, Math.max(WEBCAM_MIN_SIZE, height * 0.2)))
}

export function createWebcamBubble(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const size = defaultWebcamSize()
  const margin = 40
  const x = display.workArea.x + display.workArea.width - size - margin
  const y = display.workArea.y + display.workArea.height - size - margin

  webcamWindow = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    minWidth: WEBCAM_MIN_SIZE,
    minHeight: WEBCAM_MIN_SIZE,
    maxWidth: WEBCAM_MAX_SIZE,
    maxHeight: WEBCAM_MAX_SIZE,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  webcamWindow.setAlwaysOnTop(true, 'screen-saver')
  webcamWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  webcamWindow.setContentProtection(true)
  // Keep it square — a non-square resize would turn the circular bubble
  // into an ellipse. Force width == height on every manual resize, anchored
  // to the window's center so it grows/shrinks in place.
  webcamWindow.on('will-resize', (event, newBounds) => {
    const side = Math.max(newBounds.width, newBounds.height)
    const cx = newBounds.x + newBounds.width / 2
    const cy = newBounds.y + newBounds.height / 2
    event.preventDefault()
    webcamWindow?.setBounds({
      x: Math.round(cx - side / 2),
      y: Math.round(cy - side / 2),
      width: side,
      height: side
    })
  })
  webcamWindow.on('ready-to-show', () => webcamWindow?.show())
  webcamWindow.on('closed', () => {
    webcamWindow = null
  })
  load(webcamWindow, '/webcam')
  return webcamWindow
}

/** Grow/shrink the bubble by a step, anchored to its current center. Used
 *  for scroll-to-resize, since a frameless transparent window has no
 *  visible OS resize handle to drag. */
export function resizeWebcamBubble(deltaPx: number): void {
  if (!webcamWindow) return
  const b = webcamWindow.getBounds()
  const side = Math.min(WEBCAM_MAX_SIZE, Math.max(WEBCAM_MIN_SIZE, b.width + deltaPx))
  const cx = b.x + b.width / 2
  const cy = b.y + b.height / 2
  webcamWindow.setBounds({
    x: Math.round(cx - side / 2),
    y: Math.round(cy - side / 2),
    width: Math.round(side),
    height: Math.round(side)
  })
}

export interface WebcamPlacement {
  size: number
  /** 0..1 fraction of the available horizontal/vertical travel on whichever
   *  display the bubble currently sits on — i.e. 0 = flush left/top,
   *  1 = flush right/bottom. ffmpeg resolves these against the actual
   *  captured frame's real pixel size at encode time (via main_w/main_h),
   *  so this works regardless of the display's DPI scaling. */
  xFrac: number
  yFrac: number
}

/** Reads the webcam bubble's current on-screen position so the final
 *  composited video can place the circle wherever the user actually left
 *  it, instead of always hardcoding the bottom-right corner. Must be called
 *  before the window closes. */
export function getWebcamPlacement(): WebcamPlacement | null {
  if (!webcamWindow || webcamWindow.isDestroyed()) return null
  const b = webcamWindow.getBounds()
  const display = screen.getDisplayNearestPoint({
    x: b.x + b.width / 2,
    y: b.y + b.height / 2
  })
  const area = display.bounds
  const clamp = (v: number): number => Math.min(1, Math.max(0, v))
  return {
    size: b.width,
    xFrac: clamp((b.x - area.x) / Math.max(1, area.width - b.width)),
    yFrac: clamp((b.y - area.y) / Math.max(1, area.height - b.height))
  }
}

/** Opens a fullscreen transparent overlay on the primary display for the
 *  user to drag out a capture rectangle, and resolves with it expressed as
 *  0..1 fractions of that display's bounds (or null if cancelled). Reuses
 *  the existing full-screen capture pipeline — the rect is only applied as
 *  an ffmpeg crop at encode time, so no new capture path is needed. */
export function openRegionSelectWindow(): Promise<RegionRect | null> {
  return new Promise((resolve) => {
    const display = screen.getPrimaryDisplay()
    const win = new BrowserWindow({
      x: display.bounds.x,
      y: display.bounds.y,
      width: display.bounds.width,
      height: display.bounds.height,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      fullscreenable: false,
      show: false,
      webPreferences: { preload, sandbox: false }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    let settled = false
    const finish = (rect: RegionRect | null): void => {
      if (settled) return
      settled = true
      ipcMain.removeListener('region:result', onResult)
      resolve(rect)
      if (!win.isDestroyed()) win.close()
    }
    const onResult = (_evt: unknown, rect: RegionRect | null): void => finish(rect)

    ipcMain.on('region:result', onResult)
    win.on('ready-to-show', () => win.show())
    win.on('closed', () => finish(null))
    load(win, '/region-select')
  })
}

export function closeRecordingWindows(): void {
  controlWindow?.close()
  webcamWindow?.close()
  inputOverlayWindow?.close()
}

export function createEditorWindow(filePath: string, micPath?: string | null): BrowserWindow {
  editorWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 720,
    minHeight: 480,
    show: false,
    icon,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#000000', symbolColor: '#ffffff', height: 36 },
    backgroundColor: '#000000',
    webPreferences: { preload, sandbox: false }
  })
  editorWindow.on('ready-to-show', () => editorWindow?.show())
  editorWindow.on('closed', () => {
    editorWindow = null
  })
  const micParam = micPath ? `&mic=${encodeURIComponent(micPath)}` : ''
  load(editorWindow, `/editor?file=${encodeURIComponent(filePath)}${micParam}`)
  return editorWindow
}
