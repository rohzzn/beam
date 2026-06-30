import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

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

export function createWebcamBubble(): BrowserWindow {
  const display = screen.getPrimaryDisplay()
  const size = 220
  const margin = 40
  const x = display.workArea.x + display.workArea.width - size - margin
  const y = display.workArea.y + display.workArea.height - size - margin

  webcamWindow = new BrowserWindow({
    width: size,
    height: size,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: { preload, sandbox: false }
  })
  webcamWindow.setAlwaysOnTop(true, 'screen-saver')
  webcamWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  webcamWindow.setContentProtection(true)
  webcamWindow.on('ready-to-show', () => webcamWindow?.show())
  webcamWindow.on('closed', () => {
    webcamWindow = null
  })
  load(webcamWindow, '/webcam')
  return webcamWindow
}

export function closeRecordingWindows(): void {
  controlWindow?.close()
  webcamWindow?.close()
}

export function createEditorWindow(filePath: string): BrowserWindow {
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
  load(editorWindow, `/editor?file=${encodeURIComponent(filePath)}`)
  return editorWindow
}
