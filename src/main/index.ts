import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
  session,
  protocol,
  net
} from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { createHomeWindow } from './windows'
import { registerIpcHandlers } from './ipc'
import { recorderState } from './state'

// Must run before app is ready. The renderer is served from http://localhost
// in dev (and from an `app://`-equivalent file origin in prod), so a plain
// `file://` <video src> is blocked by Electron's local-resource security
// check. This privileged custom scheme lets the editor stream local
// recordings (with Range support, for scrubbing) without disabling
// webSecurity.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'beam-media',
    privileges: { standard: true, supportFetchAPI: true, stream: true, corsEnabled: true }
  }
])

let tray: Tray | null = null

function createTray(): void {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)
  tray.setToolTip('Beam')
  const menu = Menu.buildFromTemplate([
    {
      label: 'Open Beam',
      click: () => createHomeWindow()
    },
    { type: 'separator' },
    {
      label: 'Quit Beam',
      click: () => app.quit()
    }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => createHomeWindow())
}

function setupDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler(async (_request, callback) => {
    const options = recorderState.options
    if (!options) {
      callback({})
      return
    }
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] })
    const match = sources.find((s) => s.id === options.sourceId)
    callback({
      video: match ?? sources[0],
      audio: options.systemAudio ? 'loopback' : undefined
    })
  })
}

process.on('uncaughtException', (err) => {
  console.error('[beam] uncaughtException', err)
})

app.whenReady().then(() => {
  console.log('[beam] app ready, bootstrapping...')
  electronApp.setAppUserModelId('com.beam.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  protocol.handle('beam-media', (request) => {
    const filePath = decodeURIComponent(request.url.replace('beam-media://local/', ''))
    return net.fetch(`file:///${filePath.replace(/\\/g, '/')}`)
  })

  setupDisplayMediaHandler()
  registerIpcHandlers()
  console.log('[beam] ipc registered, creating tray...')
  try {
    createTray()
  } catch (err) {
    console.error('[beam] tray creation failed', err)
  }
  console.log('[beam] creating home window...')
  const win = createHomeWindow()
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[beam] did-fail-load', code, desc, url)
  })
  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('[beam] render-process-gone', details)
  })

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createHomeWindow()
  })
})

// Beam lives in the tray; closing the Home/Editor windows shouldn't quit
// the app, since a recording (control bar + webcam bubble) may be active.
app.on('window-all-closed', () => {})

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })
})
