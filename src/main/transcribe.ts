import { app } from 'electron'
import { join, basename, extname } from 'path'
import { writeFile, unlink, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { getTempDir } from './paths'
import { extractAudioForTranscription } from './ffmpeg'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null

async function getTranscriber(): Promise<
  (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>
> {
  if (!pipelinePromise) {
    pipelinePromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers')
      env.cacheDir = join(app.getPath('userData'), 'models')
      return pipeline('automatic-speech-recognition', 'Xenova/whisper-base.en')
    })()
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return pipelinePromise as any
}

/** Reads a mono 16-bit PCM WAV (as produced by ffmpeg -c:a pcm_s16le) into a Float32Array. */
async function wavToFloat32(path: string): Promise<Float32Array> {
  const buf = await readFile(path)
  // Standard WAV header is 44 bytes for a simple PCM file like the one ffmpeg writes here.
  const dataStart = 44
  const sampleCount = (buf.length - dataStart) / 2
  const floats = new Float32Array(sampleCount)
  for (let i = 0; i < sampleCount; i++) {
    floats[i] = buf.readInt16LE(dataStart + i * 2) / 32768
  }
  return floats
}

function formatSrtTime(seconds: number): string {
  const ms = Math.round(seconds * 1000)
  const h = Math.floor(ms / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const msRem = ms % 1000
  const pad = (n: number, len = 2): string => String(n).padStart(len, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(msRem, 3)}`
}

interface TranscriptionChunk {
  text: string
  timestamp: [number, number | null]
}

function buildSrt(chunks: TranscriptionChunk[]): string {
  return chunks
    .map((chunk, i) => {
      const [start, end] = chunk.timestamp
      const safeEnd = end ?? start + 2
      return `${i + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(safeEnd)}\n${chunk.text.trim()}\n`
    })
    .join('\n')
}

export async function transcribeFile(
  filePath: string,
  micPath?: string
): Promise<{ text: string; srtPath: string | null }> {
  // Mic and system audio are mixed into one track in the final video, so
  // extracting from filePath directly would transcribe whatever the OS
  // played too (music, notification sounds, other apps) right alongside the
  // user's actual speech. When a recording captured the mic separately, use
  // that isolated copy instead — it's a temp file handed off specifically
  // for this, so it's deleted once transcription has consumed it.
  const useMic = !!micPath && existsSync(micPath)
  const source = useMic ? micPath : filePath

  const tempDir = getTempDir()
  const wavPath = join(tempDir, `transcribe-${Date.now()}.wav`)
  await extractAudioForTranscription(source, wavPath)

  try {
    const audio = await wavToFloat32(wavPath)
    const transcriber = await getTranscriber()
    const result = (await transcriber(audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true
    })) as { text: string; chunks?: TranscriptionChunk[] }

    let srtPath: string | null = null
    if (result.chunks && result.chunks.length > 0) {
      srtPath = join(join(filePath, '..'), `${basename(filePath, extname(filePath))}.srt`)
      await writeFile(srtPath, buildSrt(result.chunks), 'utf-8')
    }

    return { text: result.text.trim(), srtPath }
  } finally {
    await unlink(wavPath).catch(() => {})
    if (useMic) await unlink(micPath!).catch(() => {})
  }
}
