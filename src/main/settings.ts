import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

export type Quality = 'standard' | 'high' | 'maximum'

export interface RecordingPrefs {
  micEnabled: boolean
  micDeviceId?: string
  webcamEnabled: boolean
  webcamDeviceId?: string
  systemAudio: boolean
  quality: Quality
  showClicks: boolean
  showKeystrokes: boolean
  autoZoom: boolean
}

export interface BeamSettings {
  outputDir: string | null
  hotkeyEnabled: boolean
  startStopHotkey: string
  recordingPrefs: RecordingPrefs
}

const DEFAULTS: BeamSettings = {
  outputDir: null,
  hotkeyEnabled: true,
  startStopHotkey: 'Alt+Shift+R',
  recordingPrefs: {
    micEnabled: true,
    webcamEnabled: false,
    systemAudio: false,
    quality: 'high',
    showClicks: false,
    showKeystrokes: false,
    autoZoom: false
  }
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

let cache: BeamSettings | null = null

function readFromDisk(): BeamSettings {
  try {
    const raw = readFileSync(settingsPath(), 'utf-8')
    const parsed = JSON.parse(raw)
    // Shallow-merge would drop new recordingPrefs fields (e.g. showClicks)
    // entirely when loading a settings.json saved before those fields
    // existed, since the whole nested object gets replaced, not merged.
    return {
      ...DEFAULTS,
      ...parsed,
      recordingPrefs: { ...DEFAULTS.recordingPrefs, ...parsed.recordingPrefs }
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function loadSettings(): BeamSettings {
  if (!cache) cache = readFromDisk()
  return cache
}

export function saveSettings(partial: Partial<BeamSettings>): BeamSettings {
  const next = { ...loadSettings(), ...partial }
  cache = next
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf-8')
  return next
}

export function settingsFileExists(): boolean {
  return existsSync(settingsPath())
}
