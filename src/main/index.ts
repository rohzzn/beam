import {
  app,
  shell,
  BrowserWindow,
  desktopCapturer,
  Tray,
  Menu,
  nativeImage,
  session,
  protocol
} from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { createReadStream, statSync } from 'fs'
import { Readable } from 'stream'
import type { ReadableStream as NodeWebReadableStream } from 'stream/web'
import icon from '../../resources/icon.png?asset'
import { createHomeWindow, getHomeWindow } from './windows'
import { registerIpcHandlers } from './ipc'
import { recorderState } from './state'
import { registerHotkeys, unregisterHotkeys } from './hotkeys'
import { initAutoUpdater, checkForUpdatesManually } from './updater'
import { sweepTempDir } from './paths'

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

// Without this, launching Beam a second time (Start Menu, startup + manual
// open, a stray leftover process from a previous run) spins up a second
// tray icon and a second registration of the same global hotkey. Only one
// instance can actually win the OS-level hotkey registration, but which one
// is unpredictable — and a second idle instance still has its own (wrong)
// idea of whether a recording is active, which is its own source of "the
// hotkey did something weird" bugs independent of the key-repeat issue
// above. Bail out of the second launch entirely and just focus the first.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}
app.on('second-instance', () => {
  getHomeWindow()?.show()
  getHomeWindow()?.focus()
})

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
      label: 'Check for Updates…',
      click: () => checkForUpdatesManually()
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

    let fileSize: number
    try {
      fileSize = statSync(filePath).size
    } catch {
      return new Response('Not found', { status: 404 })
    }

    // Seeking in <video> issues a ranged request (Range: bytes=...). Electron's
    // net.fetch doesn't implement HTTP range semantics for file:// URLs — it
    // always returns the full file with status 200 regardless of the Range
    // header, which browsers treat as "this resource isn't seekable", so
    // currentTime snaps back to 0 on every seek. Serving the requested byte
    // range ourselves (status 206 + Content-Range) is what makes seeking work.
    const rangeHeader = request.headers.get('range')
    const match = rangeHeader ? /bytes=(\d*)-(\d*)/.exec(rangeHeader) : null
    const start = match?.[1] ? parseInt(match[1], 10) : 0
    const end = match?.[2] ? parseInt(match[2], 10) : fileSize - 1

    const stream = Readable.toWeb(
      createReadStream(filePath, { start, end })
    ) as NodeWebReadableStream<Uint8Array>

    if (!rangeHeader) {
      return new Response(stream as unknown as ReadableStream, {
        status: 200,
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(fileSize),
          'accept-ranges': 'bytes'
        }
      })
    }

    return new Response(stream as unknown as ReadableStream, {
      status: 206,
      headers: {
        'content-type': 'video/mp4',
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${fileSize}`,
        'accept-ranges': 'bytes'
      }
    })
  })

  try {
    sweepTempDir()
  } catch (err) {
    console.error('[beam] temp dir sweep failed', err)
  }
  setupDisplayMediaHandler()
  registerIpcHandlers()
  registerHotkeys()
  initAutoUpdater()
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

app.on('will-quit', () => {
  unregisterHotkeys()
})
