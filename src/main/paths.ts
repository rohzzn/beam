import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
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
