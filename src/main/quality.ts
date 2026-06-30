import type { Quality } from './state'

interface QualityPreset {
  /** x264 CRF — lower is higher quality/larger file. */
  crf: number
  preset: string
}

const PRESETS: Record<Quality, QualityPreset> = {
  standard: { crf: 24, preset: 'veryfast' },
  high: { crf: 18, preset: 'fast' },
  maximum: { crf: 14, preset: 'slow' }
}

export function getQualityPreset(quality: Quality | undefined): QualityPreset {
  return PRESETS[quality ?? 'high']
}
