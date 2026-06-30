import type { Quality } from '../../../preload/index'

export interface QualityOption {
  value: Quality
  label: string
  detail: string
  videoBitsPerSecond: number
}

export const QUALITY_OPTIONS: QualityOption[] = [
  {
    value: 'standard',
    label: 'Standard',
    detail: 'Smaller file, quickest to share',
    videoBitsPerSecond: 6_000_000
  },
  {
    value: 'high',
    label: 'High',
    detail: 'Balanced quality and file size',
    videoBitsPerSecond: 15_000_000
  },
  {
    value: 'maximum',
    label: 'Maximum',
    detail: 'Best possible quality, largest file',
    videoBitsPerSecond: 35_000_000
  }
]

export function getVideoBitsPerSecond(quality: Quality): number {
  return (QUALITY_OPTIONS.find((o) => o.value === quality) ?? QUALITY_OPTIONS[1]).videoBitsPerSecond
}
