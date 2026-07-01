import { app } from 'electron'
import { join, basename, extname } from 'path'
import { writeFile } from 'fs/promises'
import { buildSrt, TranscriptionChunk } from './transcribe'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null

/** Live captions use the smaller/faster "tiny" model rather than the "base"
 *  model the post-recording transcript uses — accuracy matters less for a
 *  rough draft transcript than for the final burned-in captions, and this
 *  runs continuously alongside the actual screen/webcam/mic capture, so
 *  keeping its CPU footprint small matters more than usual. */
async function getLiveTranscriber(): Promise<
  (audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string }>
> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = join(app.getPath('userData'), 'models')
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny.en')
    })()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pipelinePromise as any
}

let busy = false
let pending: { samples: Float32Array; start: number; duration: number } | null = null
let entries: TranscriptionChunk[] = []

async function runNext(): Promise<void> {
  if (busy || !pending) return
  const { samples, start, duration } = pending
  pending = null
  busy = true
  try {
    const transcriber = await getLiveTranscriber()
    const result = await transcriber(samples, {})
    const text = result.text.trim()
    if (text) entries.push({ text, timestamp: [start, start + duration] })
  } catch (err) {
    console.error('[beam] live caption chunk failed', err)
  } finally {
    busy = false
    // A newer chunk may have arrived while this one was processing —
    // process it next, discarding whatever's already stale rather than
    // ever queueing up more than one chunk deep. That's what keeps the
    // background transcript from drifting further and further behind the
    // longer a recording runs, at the cost of occasionally skipping a
    // phrase — an acceptable trade for a rough draft the user reviews and
    // edits afterward anyway, rather than a verbatim transcript.
    runNext()
  }
}

/** Queues a rolling window of raw mic samples (with its position in the
 *  recording's own timeline) for background transcription. Only one chunk
 *  is ever in flight; a chunk that arrives while busy replaces whatever was
 *  already waiting. Results accumulate silently — nothing renders live on
 *  screen or in the recording; this is purely a head start on the
 *  transcript for whenever the user opens the editor afterward. */
export function queueLiveCaptionChunk(
  samples: Float32Array,
  start: number,
  duration: number
): void {
  pending = { samples, start, duration }
  runNext()
}

/** Drops accumulated entries and in-flight bookkeeping between recordings.
 *  The transcriber pipeline itself stays loaded/cached. */
export function resetLiveCaptions(): void {
  pending = null
  entries = []
}

/** Turns whatever got transcribed in the background during recording into
 *  the same {text, srtPath} shape transcribeFile() produces, saved next to
 *  the video using the same naming convention — so the editor can treat a
 *  live-captioned recording exactly like one that was transcribed normally,
 *  just without the wait. Returns null if nothing was ever transcribed
 *  (e.g. a silent recording, or live captions weren't actually on). */
export async function finalizeLiveTranscript(
  videoPath: string
): Promise<{ text: string; srtPath: string | null } | null> {
  if (entries.length === 0) return null
  const ordered = [...entries].sort((a, b) => a.timestamp[0] - b.timestamp[0])
  const srtPath = join(join(videoPath, '..'), `${basename(videoPath, extname(videoPath))}.srt`)
  await writeFile(srtPath, buildSrt(ordered), 'utf-8')
  return { text: ordered.map((e) => e.text).join(' '), srtPath }
}
