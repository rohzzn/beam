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
    showKeystrokes: prefs.showKeystrokes,
    liveCaptions: prefs.liveCaptions
  })
}

function stopActiveRecording(): void {
  getControlWindow()?.webContents.send('recording:remote-stop')
}

export function registerHotkeys(): void {
  applyHotkeySetting()
}

// Windows re-fires a registered global hotkey's WM_HOTKEY on OS-level key
// repeat if the combo is held even slightly too long — very easy to do with
// a 3-key chord like Alt+Shift+R. Without a guard, that second firing lands
// a beat after the first, sees a recording now in progress, and immediately
// stops it — "starts and stops within a second" from a single physical
// press. 700ms comfortably covers a real held-key repeat without blocking a
// deliberate quick double-tap to start-then-stop.
const RETRIGGER_GUARD_MS = 700
let lastTriggeredAt = 0

export function applyHotkeySetting(): void {
  globalShortcut.unregisterAll()
  const { hotkeyEnabled, startStopHotkey } = loadSettings()
  if (!hotkeyEnabled) return

  try {
    globalShortcut.register(startStopHotkey, () => {
      const now = Date.now()
      if (now - lastTriggeredAt < RETRIGGER_GUARD_MS) return
      lastTriggeredAt = now

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
