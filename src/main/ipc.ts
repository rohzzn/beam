import { ipcMain, desktopCapturer, shell, clipboard, app, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
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
  burnCaptions,
  cropVideo,
  TrimSegment,
  CaptionStyle
} from './ffmpeg'
import { recorderState, resetRecorderState, RecordingOptions, RegionRect } from './state'
import { transcribeFile } from './transcribe'
import { queueLiveCaptionChunk, resetLiveCaptions, finalizeLiveTranscript } from './liveCaption'
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

  ipcMain.handle('recording:submit-mic', async (_evt, buffer: ArrayBuffer) => {
    const dir = getTempDir()
    const filePath = join(dir, `mic-${Date.now()}.webm`)
    await writeFile(filePath, Buffer.from(buffer))
    recorderState.micBufferPath = filePath
    await maybeFinalize()
  })

  ipcMain.on('recording:mic-unavailable', () => {
    recorderState.micUnavailable = true
    maybeFinalize().catch((err) =>
      console.error('[beam] finalize after mic-unavailable failed', err)
    )
  })

  ipcMain.on('recording:webcam-unavailable', () => {
    recorderState.webcamUnavailable = true
    maybeFinalize().catch((err) =>
      console.error('[beam] finalize after webcam-unavailable failed', err)
    )
  })

  ipcMain.on(
    'recording:live-caption-chunk',
    (_evt, payload: { samples: ArrayBuffer; start: number; duration: number }) => {
      queueLiveCaptionChunk(new Float32Array(payload.samples), payload.start, payload.duration)
    }
  )

  ipcMain.handle('recording:cancel', async (_evt, reason?: string) => {
    stopInputMonitor()
    closeRecordingWindows()
    resetLiveCaptions()
    const { micBufferPath } = recorderState
    if (micBufferPath && existsSync(micBufferPath)) {
      await unlink(micBufferPath).catch(() => {})
    }
    await cleanupTempFiles()
    resetRecorderState()
    const home = getHomeWindow()
    home?.show()
    // Without this, a failed start silently reverts to the picker with zero
    // explanation — the exact "did it even click?" confusion that made the
    // original mic-crash bug so hard to pin down from a bug report alone.
    if (reason) home?.webContents.send('recording:failed', reason)
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
    'editor:burnCaptions',
    async (_evt, payload: { filePath: string; srtPath: string; style: CaptionStyle }) => {
      const dir = getOutputDir()
      const outPath = join(dir, timestampedFilename('mp4'))
      await burnCaptions(payload.filePath, payload.srtPath, outPath, payload.style)
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

  ipcMain.handle('editor:crop', async (_evt, payload: { filePath: string; region: RegionRect }) => {
    const dir = getOutputDir()
    const outPath = join(dir, timestampedFilename('mp4'))
    await cropVideo(payload.filePath, outPath, payload.region)
    return outPath
  })

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

  ipcMain.handle('transcription:run', async (_evt, filePath: string, micPath?: string) => {
    return transcribeFile(filePath, micPath)
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
  const {
    options,
    screenBufferPath,
    webcamBufferPath,
    micBufferPath,
    micUnavailable,
    webcamUnavailable
  } = recorderState
  if (!options || !screenBufferPath) return
  if (options.webcamEnabled && !webcamBufferPath && !webcamUnavailable) return
  // Mic-only capture is an optional transcription nicety, never a hard
  // requirement — wait for it only while it's still plausibly coming.
  if (options.micEnabled && !micBufferPath && !micUnavailable) return

  const outDir = getOutputDir()
  const outPath = join(outDir, timestampedFilename('mp4'))
  const quality = getQualityPreset(options.quality)
  // Must read this before closeRecordingWindows() below — once the bubble
  // window closes, its bounds are gone.
  const placement = options.webcamEnabled ? getWebcamPlacement() : null
  const region = options.region ?? null

  try {
    if (options.webcamEnabled && webcamBufferPath) {
      await overlayWebcamBubble(
        screenBufferPath,
        webcamBufferPath,
        outPath,
        quality,
        placement,
        region
      )
    } else {
      await transcodeScreenOnly(screenBufferPath, outPath, quality, region)
    }
  } catch (err) {
    console.error('ffmpeg processing failed', err)
    await transcodeScreenOnly(screenBufferPath, outPath, quality, region).catch((e) =>
      console.error('fallback transcode also failed', e)
    )
  }

  // Read before resetLiveCaptions() clears the accumulated entries below.
  // Live captions are transcribed quietly in the background during
  // recording (see liveCaption.ts) — nothing shows on screen or gets baked
  // into the video. This is where that pays off: the editor opens with a
  // rough transcript already sitting there instead of the user having to
  // wait through a fresh transcription pass.
  const liveTranscript = await finalizeLiveTranscript(outPath).catch((err) => {
    console.error('[beam] finalizing live transcript failed', err)
    return null
  })

  stopInputMonitor()
  closeRecordingWindows()
  resetLiveCaptions()
  await cleanupTempFiles()
  resetRecorderState()
  // micBufferPath is deliberately left on disk here (cleanupTempFiles only
  // touches screen/webcam) — the editor needs it for on-demand
  // mic-only transcription, and transcribeFile deletes it once used.
  createEditorWindow(outPath, micBufferPath, liveTranscript?.srtPath ?? null)
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
