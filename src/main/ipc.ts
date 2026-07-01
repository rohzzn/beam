import { ipcMain, desktopCapturer, shell, clipboard, app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { writeFile, unlink, copyFile } from 'fs/promises'
import { existsSync } from 'fs'
import { execFile } from 'child_process'
import {
  createEditorWindow,
  closeRecordingWindows,
  getHomeWindow,
  getWebcamWindow,
  resizeWebcamBubble,
  getWebcamPlacement,
  openRegionSelectWindow
} from './windows'
import { getOutputDir, getTempDir, timestampedFilename } from './paths'
import {
  transcodeScreenOnly,
  overlayWebcamBubble,
  trimSegments,
  exportGifSegments,
  applyAutoZoom,
  TrimSegment
} from './ffmpeg'
import { recorderState, resetRecorderState, RecordingOptions, RegionRect } from './state'
import { transcribeFile } from './transcribe'
import { getQualityPreset } from './quality'
import { beginRecording } from './recording'
import { stopInputMonitor } from './inputMonitor'
import { loadSettings, saveSettings, RecordingPrefs } from './settings'
import { applyHotkeySetting } from './hotkeys'

export function registerIpcHandlers(): void {
  ipcMain.handle('sources:list', async () => {
    const sources = await desktopCapturer.getSources({
      types: ['window', 'screen'],
      thumbnailSize: { width: 320, height: 180 },
      fetchWindowIcons: true
    })
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      type: s.id.startsWith('screen') ? 'screen' : 'window',
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null
    }))
  })

  ipcMain.handle('recording:start', async (_evt, options: RecordingOptions) => {
    await beginRecording(options)
  })

  ipcMain.on('recording:control-event', (_evt, payload: { type: 'pause' | 'resume' | 'stop' }) => {
    getWebcamWindow()?.webContents.send('recording:control-event', payload)
  })

  // Marks t=0 for the auto-zoom click timeline. Sent right after the
  // renderer's MediaRecorder actually starts, rather than assumed from
  // beginRecording(), since window creation + getDisplayMedia setup can
  // take a variable amount of time before capture truly begins.
  ipcMain.on('recording:capture-started', () => {
    recorderState.captureStartedAt = Date.now()
  })

  ipcMain.on('webcam:resize', (_evt, deltaPx: number) => {
    resizeWebcamBubble(deltaPx)
  })

  ipcMain.handle('recording:submit-screen', async (_evt, buffer: ArrayBuffer) => {
    const dir = getTempDir()
    const filePath = join(dir, `screen-${Date.now()}.webm`)
    await writeFile(filePath, Buffer.from(buffer))
    recorderState.screenBufferPath = filePath
    await maybeFinalize()
  })

  ipcMain.handle('recording:submit-webcam', async (_evt, buffer: ArrayBuffer) => {
    const dir = getTempDir()
    const filePath = join(dir, `webcam-${Date.now()}.webm`)
    await writeFile(filePath, Buffer.from(buffer))
    recorderState.webcamBufferPath = filePath
    await maybeFinalize()
  })

  ipcMain.handle('recording:cancel', async () => {
    stopInputMonitor()
    closeRecordingWindows()
    await cleanupTempFiles()
    resetRecorderState()
    getHomeWindow()?.show()
  })

  ipcMain.handle(
    'editor:trim',
    async (_evt, payload: { filePath: string; segments: TrimSegment[] }) => {
      const dir = getOutputDir()
      const outPath = join(dir, timestampedFilename('mp4'))
      await trimSegments(payload.filePath, outPath, payload.segments)
      return outPath
    }
  )

  ipcMain.handle(
    'editor:exportGif',
    async (_evt, payload: { filePath: string; segments: TrimSegment[] }) => {
      const dir = getOutputDir()
      const outPath = join(dir, timestampedFilename('gif'))
      await exportGifSegments(payload.filePath, outPath, payload.segments)
      return outPath
    }
  )

  ipcMain.handle('editor:reveal', (_evt, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('editor:copyPath', (_evt, filePath: string) => {
    clipboard.writeText(filePath)
  })

  ipcMain.handle('editor:copyFile', async (_evt, filePath: string) => {
    await copyFileToClipboard(filePath)
  })

  ipcMain.handle('editor:openHome', () => {
    BrowserWindow.getFocusedWindow()?.close()
    getHomeWindow()?.show()
  })

  ipcMain.handle('transcription:run', async (_evt, filePath: string) => {
    return transcribeFile(filePath)
  })

  ipcMain.handle('app:getVideosDir', () => getOutputDir())

  ipcMain.handle('settings:get', () => loadSettings())

  ipcMain.handle('settings:saveRecordingPrefs', (_evt, prefs: RecordingPrefs) => {
    return saveSettings({ recordingPrefs: prefs })
  })

  ipcMain.handle(
    'settings:setHotkey',
    (_evt, payload: { enabled: boolean; accelerator: string }) => {
      const next = saveSettings({
        hotkeyEnabled: payload.enabled,
        startStopHotkey: payload.accelerator
      })
      applyHotkeySetting()
      return next
    }
  )

  ipcMain.handle('settings:chooseOutputDir', async () => {
    const win = getHomeWindow()
    const result = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return loadSettings().outputDir
    return saveSettings({ outputDir: result.filePaths[0] }).outputDir
  })

  ipcMain.handle('settings:resetOutputDir', () => {
    return saveSettings({ outputDir: null }).outputDir
  })

  ipcMain.handle('region:select', async (): Promise<RegionRect | null> => {
    return openRegionSelectWindow()
  })
}

/** Electron's clipboard API has no documented cross-platform way to put a
 *  file reference (CF_HDROP) on the clipboard, only text/images/buffers —
 *  see electron/electron#9035. Shelling out to PowerShell's Set-Clipboard
 *  is the standard pragmatic workaround on Windows, and gives a real
 *  "paste the file" experience in Explorer, Discord, Slack, etc. */
async function copyFileToClipboard(filePath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const psPath = filePath.replace(/'/g, "''")
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -Path '${psPath}'`],
      (err) => {
        if (err) reject(err)
        else resolve()
      }
    )
  })
}

async function maybeFinalize(): Promise<void> {
  const { options, screenBufferPath, webcamBufferPath, clickEvents } = recorderState
  if (!options || !screenBufferPath) return
  if (options.webcamEnabled && !webcamBufferPath) return

  const outDir = getOutputDir()
  const outPath = join(outDir, timestampedFilename('mp4'))
  const quality = getQualityPreset(options.quality)
  // Must read this before closeRecordingWindows() below — once the bubble
  // window closes, its bounds are gone.
  const placement = options.webcamEnabled ? getWebcamPlacement() : null
  const region = options.region ?? null

  // Auto-zoom is a second pass over the already-composited video, so the
  // first pass writes to a temp file instead of the final output whenever
  // there's actually something to zoom to.
  const wantsZoom = !!options.autoZoom && clickEvents.length > 0
  const compositePath = wantsZoom ? join(getTempDir(), `composite-${Date.now()}.mp4`) : outPath

  try {
    if (options.webcamEnabled && webcamBufferPath) {
      await overlayWebcamBubble(
        screenBufferPath,
        webcamBufferPath,
        compositePath,
        quality,
        placement,
        region
      )
    } else {
      await transcodeScreenOnly(screenBufferPath, compositePath, quality, region)
    }
  } catch (err) {
    console.error('ffmpeg processing failed', err)
    await transcodeScreenOnly(screenBufferPath, compositePath, quality, region).catch((e) =>
      console.error('fallback transcode also failed', e)
    )
  }

  if (wantsZoom) {
    try {
      await applyAutoZoom(compositePath, outPath, clickEvents)
    } catch (err) {
      console.error('auto-zoom failed, using un-zoomed composite', err)
      await copyFile(compositePath, outPath)
    } finally {
      await unlink(compositePath).catch(() => {})
    }
  }

  stopInputMonitor()
  closeRecordingWindows()
  await cleanupTempFiles()
  resetRecorderState()
  createEditorWindow(outPath)
}

async function cleanupTempFiles(): Promise<void> {
  const { screenBufferPath, webcamBufferPath } = recorderState
  for (const p of [screenBufferPath, webcamBufferPath]) {
    if (p && existsSync(p)) {
      await unlink(p).catch(() => {})
    }
  }
}

app.on('before-quit', () => {
  stopInputMonitor()
  cleanupTempFiles().catch(() => {})
})
