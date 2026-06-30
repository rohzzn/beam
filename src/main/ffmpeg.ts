import { spawn } from 'child_process'
import ffmpegPath from 'ffmpeg-static'

const FFMPEG_BIN = (ffmpegPath as unknown as string).replace('app.asar', 'app.asar.unpacked')

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(FFMPEG_BIN, args)
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exited with code ${code}\n${stderr.slice(-4000)}`))
    })
  })
}

interface EncodeQuality {
  crf: number
  preset: string
}

const DEFAULT_QUALITY: EncodeQuality = { crf: 18, preset: 'fast' }

/** Transcode a single screen-only webm capture to mp4. */
export async function transcodeScreenOnly(
  inputWebm: string,
  outputMp4: string,
  quality: EncodeQuality = DEFAULT_QUALITY
): Promise<void> {
  await run([
    '-y',
    '-i',
    inputWebm,
    '-c:v',
    'libx264',
    '-preset',
    quality.preset,
    '-crf',
    String(quality.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputMp4
  ])
}

/** Composite a circular webcam bubble (bottom-right) over the screen recording. */
export async function overlayWebcamBubble(
  screenWebm: string,
  webcamWebm: string,
  outputMp4: string,
  quality: EncodeQuality = DEFAULT_QUALITY,
  bubbleSize = 220,
  margin = 36
): Promise<void> {
  const r = bubbleSize / 2
  // A hard if/lte step here (alpha = 255 or 0, nothing between) gives the
  // circle a visibly jagged, stair-stepped pixel edge with no anti-aliasing.
  // Feathering alpha linearly over a ~1.5px band around the radius (using
  // hypot for distance-from-center) gives a smooth, anti-aliased edge
  // instead, matching how a CSS border-radius circle would render.
  const feather = 1.5
  const alphaExpr = `255*clip((${r}-hypot(X-${r},Y-${r}))/${feather}+0.5,0,1)`
  const filter =
    `[1:v]scale=${bubbleSize}:${bubbleSize}:force_original_aspect_ratio=increase,` +
    `crop=${bubbleSize}:${bubbleSize},format=yuva420p,` +
    `geq=lum='p(X,Y)':a='${alphaExpr}'[circle];` +
    `[0:v][circle]overlay=W-${bubbleSize + margin}:H-${bubbleSize + margin}[out]`

  await run([
    '-y',
    '-i',
    screenWebm,
    '-i',
    webcamWebm,
    '-filter_complex',
    filter,
    '-map',
    '[out]',
    '-map',
    '0:a?',
    '-c:v',
    'libx264',
    '-preset',
    quality.preset,
    '-crf',
    String(quality.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    outputMp4
  ])
}

/** Trim a video to [startSec, endSec] (re-encodes for frame-accurate cuts). */
export async function trimVideo(
  input: string,
  output: string,
  startSec: number,
  endSec: number
): Promise<void> {
  await run([
    '-y',
    '-i',
    input,
    '-ss',
    String(startSec),
    '-to',
    String(endSec),
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '18',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    output
  ])
}

/** Export a GIF clip from [startSec, endSec] using a two-pass palette for quality. */
export async function exportGif(
  input: string,
  output: string,
  startSec: number,
  endSec: number,
  fps = 12,
  width = 720
): Promise<void> {
  const duration = Math.max(0.1, endSec - startSec)
  const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`
  await run([
    '-y',
    '-ss',
    String(startSec),
    '-t',
    String(duration),
    '-i',
    input,
    '-vf',
    filter,
    output
  ])
}

/** Extract mono 16k WAV audio for the local transcription model. */
export async function extractAudioForTranscription(
  input: string,
  outputWav: string
): Promise<void> {
  await run(['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputWav])
}
