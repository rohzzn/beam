import { ElectronAPI } from '@electron-toolkit/preload'
import type { BeamAPI } from './index'

declare global {
  interface Window {
    electron: ElectronAPI
    beam: BeamAPI
  }
}
