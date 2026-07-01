import { globalShortcut, desktopCapturer } from 'electron'
import { getControlWindow } from './windows'
import { beginRecording, isRecording } from './recording'
import { loadSettings } from './settings'

/** Triggered by the global hotkey when nothing is recording yet: grabs the
 *  primary display and starts immediately with the user's last-used
 *  mic/webcam/quality preferences, skipping the picker entirely. */
async function startWithDefaults(): Promise<void> {
  const sources = await desktopCapturer.getSources({ types: ['screen'] })
  const primary = sources[0]
  if (!primary) return

  const prefs = loadSettings().recordingPrefs
  await beginRecording({
    sourceId: primary.id,
    sourceName: primary.name,
    micEnabled: prefs.micEnabled,
    micDeviceId: prefs.micDeviceId,
    systemAudio: prefs.systemAudio,
    webcamEnabled: prefs.webcamEnabled,
    webcamDeviceId: prefs.webcamDeviceId,
    quality: prefs.quality,
    showClicks: prefs.showClicks,
    showKeystrokes: prefs.showKeystrokes
  })
}

function stopActiveRecording(): void {
  getControlWindow()?.webContents.send('recording:remote-stop')
}

export function registerHotkeys(): void {
  applyHotkeySetting()
}

export function applyHotkeySetting(): void {
  globalShortcut.unregisterAll()
  const { hotkeyEnabled, startStopHotkey } = loadSettings()
  if (!hotkeyEnabled) return

  try {
    globalShortcut.register(startStopHotkey, () => {
      if (isRecording()) {
        stopActiveRecording()
      } else {
        startWithDefaults().catch((err) => console.error('[beam] hotkey start failed', err))
      }
    })
  } catch (err) {
    console.error('[beam] failed to register hotkey', startStopHotkey, err)
  }
}

export function unregisterHotkeys(): void {
  globalShortcut.unregisterAll()
}
