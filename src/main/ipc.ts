import { ipcMain, desktopCapturer, shell, clipboard, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { writeFile, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import {
  createControlBar,
  createWebcamBubble,
  createEditorWindow,
  closeRecordingWindows,
  getHomeWindow,
  getWebcamWindow
} from './windows'
import { getOutputDir, getTempDir, timestampedFilename } from './paths'
import { transcodeScreenOnly, overlayWebcamBubble, trimVideo, exportGif } from './ffmpeg'
import { recorderState, resetRecorderState, RecordingOptions } from './state'
import { transcribeFile } from './transcribe'
import { getQualityPreset } from './quality'

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
    resetRecorderState()
    recorderState.options = options

    getHomeWindow()?.hide()
    const control = createControlBar()
    let webcam: BrowserWindow | null = null
    if (options.webcamEnabled) {
      webcam = createWebcamBubble()
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
  })

  ipcMain.on('recording:control-event', (_evt, payload: { type: 'pause' | 'resume' | 'stop' }) => {
    getWebcamWindow()?.webContents.send('recording:control-event', payload)
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
    closeRecordingWindows()
    await cleanupTempFiles()
    resetRecorderState()
    getHomeWindow()?.show()
  })

  ipcMain.handle(
    'editor:trim',
    async (_evt, payload: { filePath: string; start: number; end: number }) => {
      const dir = getOutputDir()
      const outPath = join(dir, timestampedFilename('mp4'))
      await trimVideo(payload.filePath, outPath, payload.start, payload.end)
      return outPath
    }
  )

  ipcMain.handle(
    'editor:exportGif',
    async (_evt, payload: { filePath: string; start: number; end: number }) => {
      const dir = getOutputDir()
      const outPath = join(dir, timestampedFilename('gif'))
      await exportGif(payload.filePath, outPath, payload.start, payload.end)
      return outPath
    }
  )

  ipcMain.handle('editor:reveal', (_evt, filePath: string) => {
    shell.showItemInFolder(filePath)
  })

  ipcMain.handle('editor:copyPath', (_evt, filePath: string) => {
    clipboard.writeText(filePath)
  })

  ipcMain.handle('editor:openHome', () => {
    BrowserWindow.getFocusedWindow()?.close()
    getHomeWindow()?.show()
  })

  ipcMain.handle('transcription:run', async (_evt, filePath: string) => {
    return transcribeFile(filePath)
  })

  ipcMain.handle('app:getVideosDir', () => getOutputDir())
}

async function maybeFinalize(): Promise<void> {
  const { options, screenBufferPath, webcamBufferPath } = recorderState
  if (!options || !screenBufferPath) return
  if (options.webcamEnabled && !webcamBufferPath) return

  const outDir = getOutputDir()
  const outPath = join(outDir, timestampedFilename('mp4'))
  const quality = getQualityPreset(options.quality)

  try {
    if (options.webcamEnabled && webcamBufferPath) {
      await overlayWebcamBubble(screenBufferPath, webcamBufferPath, outPath, quality)
    } else {
      await transcodeScreenOnly(screenBufferPath, outPath, quality)
    }
  } catch (err) {
    console.error('ffmpeg processing failed', err)
    await transcodeScreenOnly(screenBufferPath, outPath, quality).catch((e) =>
      console.error('fallback transcode also failed', e)
    )
  }

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
  cleanupTempFiles().catch(() => {})
})
