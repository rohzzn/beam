import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync, readdirSync, unlinkSync } from 'fs'
import { loadSettings } from './settings'

export function getOutputDir(): string {
  const custom = loadSettings().outputDir
  const dir = custom && existsSync(custom) ? custom : join(app.getPath('videos'), 'Beam')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

export function getTempDir(): string {
  const dir = join(app.getPath('temp'), 'beam-recorder')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

/** The mic-only buffer from a finished recording is deliberately left in the
 *  temp dir (see recording.ts) so transcription can use it on demand,
 *  however long after the recording that happens to be — but if the app
 *  quits before the user ever transcribes, nothing else would ever clean it
 *  up. A real recording can't survive a full app restart, so anything left
 *  in here at the next launch is orphaned by definition; safe to sweep. */
export function sweepTempDir(): void {
  const dir = getTempDir()
  for (const name of readdirSync(dir)) {
    try {
      unlinkSync(join(dir, name))
    } catch {
      // ignore
    }
  }
}

export function timestampedFilename(ext: string): string {
  const now = new Date()
  const pad = (n: number): string => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  let hours = now.getHours()
  const ampm = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12 || 12
  const time = `${pad(hours)}.${pad(now.getMinutes())}.${pad(now.getSeconds())} ${ampm}`
  return `Beam ${date} at ${time}.${ext}`
}
