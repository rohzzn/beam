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

/** Chromium's MediaRecorder writes screen capture as variable-frame-rate
 *  video — a new frame only when the display actually changes, not on a
 *  fixed clock — while its audio track runs on a genuinely constant
 *  sample clock. Transcoding that without pinning the output to a fixed
 *  framerate leaves ffmpeg to guess how to retime the video, and the
 *  guess drifts further from the audio the longer the recording runs.
 *  Probing the source's actual average framerate and forcing the output
 *  to it (`-r` + `-fps_mode cfr`) makes ffmpeg duplicate/drop frames as
 *  needed to land on a real constant timeline instead of drifting. */
function probeFps(input: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, ['-i', input])
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', () => resolve(30))
    proc.on('close', () => {
      const match = /(\d+(?:\.\d+)?) fps/.exec(stderr)
      const fps = match ? parseFloat(match[1]) : 30
      // Screen capture's *average* fps in a VFR stream can come out oddly
      // low (long idle stretches) or implausibly high; clamp to a sane
      // range rather than trusting it blindly.
      resolve(Math.min(60, Math.max(15, fps)))
    })
  })
}

export interface RegionCrop {
  xFrac: number
  yFrac: number
  wFrac: number
  hFrac: number
}

/** Builds a `crop=` filter expression from 0..1 fractions of whatever frame
 *  it's chained after. trunc(...) guards width/height to an even number,
 *  since libx264 + yuv420p rejects odd dimensions. */
function cropFilter(region: RegionCrop): string {
  const w = `trunc(iw*${region.wFrac}/2)*2`
  const h = `trunc(ih*${region.hFrac}/2)*2`
  const x = `trunc(iw*${region.xFrac})`
  const y = `trunc(ih*${region.yFrac})`
  return `crop=${w}:${h}:${x}:${y}`
}

/** Transcode a single screen-only webm capture to mp4, optionally cropped to
 *  a user-selected region. */
export async function transcodeScreenOnly(
  inputWebm: string,
  outputMp4: string,
  quality: EncodeQuality = DEFAULT_QUALITY,
  region: RegionCrop | null = null
): Promise<void> {
  const fps = await probeFps(inputWebm)
  const args = ['-y', '-i', inputWebm]
  if (region) {
    args.push('-vf', cropFilter(region))
  }
  args.push(
    '-r',
    String(fps),
    '-fps_mode',
    'cfr',
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
  )
  await run(args)
}

export interface BubblePlacement {
  size: number
  /** 0..1 fraction of available travel; 0 = flush left/top, 1 = flush
   *  right/bottom. Resolved against the real encoded frame size at filter
   *  time (via ffmpeg's W/H), so it's correct regardless of DPI scaling. */
  xFrac: number
  yFrac: number
}

/** Composite a circular webcam bubble over the screen recording, positioned
 *  wherever the user actually left the live bubble window (falls back to
 *  bottom-right if no placement was captured). */
export async function overlayWebcamBubble(
  screenWebm: string,
  webcamWebm: string,
  outputMp4: string,
  quality: EncodeQuality = DEFAULT_QUALITY,
  placement: BubblePlacement | null = null,
  region: RegionCrop | null = null,
  margin = 36
): Promise<void> {
  // Screen and webcam are two independently-captured MediaRecorder streams,
  // each with their own variable frame timing. overlay pairs frames from
  // both against whatever timeline [0:v] happens to have, so if that base
  // is itself variable-rate the whole composite inherits the irregularity.
  // Pinning [0:v] to its own real average fps up front, inside the graph,
  // gives the rest of the chain a genuine constant timeline to composite
  // and encode against.
  const fps = await probeFps(screenWebm)
  const bubbleSize = placement?.size ?? 220
  const r = bubbleSize / 2
  // A hard if/lte step here (alpha = 255 or 0, nothing between) gives the
  // circle a visibly jagged, stair-stepped pixel edge with no anti-aliasing.
  // Feathering alpha linearly over a ~1.5px band around the radius (using
  // hypot for distance-from-center) gives a smooth, anti-aliased edge
  // instead, matching how a CSS border-radius circle would render.
  const feather = 1.5
  const alphaExpr = `255*clip((${r}-hypot(X-${r},Y-${r}))/${feather}+0.5,0,1)`
  const overlayPos =
    placement != null
      ? `(W-${bubbleSize})*${placement.xFrac.toFixed(4)}:(H-${bubbleSize})*${placement.yFrac.toFixed(4)}`
      : `W-${bubbleSize + margin}:H-${bubbleSize + margin}`
  // The bubble is composited at its absolute position on the full screen
  // frame first; the region crop (if any) is applied to that composited
  // result afterwards, same as a real recording would only show whatever
  // falls inside the selected rectangle, bubble included.
  let filter =
    `[0:v]fps=${fps}[base];` +
    `[1:v]scale=${bubbleSize}:${bubbleSize}:force_original_aspect_ratio=increase,` +
    `crop=${bubbleSize}:${bubbleSize},format=yuva420p,` +
    `geq=lum='p(X,Y)':a='${alphaExpr}'[circle];` +
    `[base][circle]overlay=${overlayPos}[out]`
  let outTag = '[out]'
  if (region) {
    filter += `;[out]${cropFilter(region)}[cropped]`
    outTag = '[cropped]'
  }

  await run([
    '-y',
    '-i',
    screenWebm,
    '-i',
    webcamWebm,
    '-filter_complex',
    filter,
    '-map',
    outTag,
    '-map',
    '0:a?',
    '-fps_mode',
    'cfr',
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

export interface TrimSegment {
  start: number
  end: number
}

/** Crops an already-recorded video down to a user-selected rectangle,
 *  reusing the same crop filter recording-time region capture uses. Audio
 *  is copied through untouched — cropping never touches it. */
export async function cropVideo(
  input: string,
  output: string,
  region: RegionCrop,
  quality: EncodeQuality = DEFAULT_QUALITY
): Promise<void> {
  const fps = await probeFps(input)
  await run([
    '-y',
    '-i',
    input,
    '-vf',
    cropFilter(region),
    '-r',
    String(fps),
    '-fps_mode',
    'cfr',
    '-c:v',
    'libx264',
    '-preset',
    quality.preset,
    '-crf',
    String(quality.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    output
  ])
}

/** Probes for an audio stream by running ffmpeg with no output — it still
 *  prints stream info to stderr before erroring on the missing output, which
 *  is the standard way to get stream info without bundling ffprobe
 *  separately. Needed because referencing a nonexistent [0:a] pad in a
 *  filter_complex graph is a hard error, unlike the `-map 0:a?` optional
 *  syntax which only applies outside filter graphs. */
function probeHasAudio(input: string): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, ['-i', input])
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', () => resolve(false))
    // ffmpeg prints e.g. "Stream #0:1[0x2](eng): Audio: aac ..." — the
    // [0x2] stream-id tag and (eng) language tag are both optional/variable,
    // so match loosely rather than anchoring to a specific bracket shape.
    proc.on('close', () => resolve(/Stream #\d+:\d+[^\n]*: Audio:/.test(stderr)))
  })
}

/** Builds a filter graph that trims each segment independently and
 *  concatenates the results in order, dropping whatever falls in the gaps
 *  between segments. A single segment behaves like a plain trim. */
function buildTrimConcatFilter(
  segments: TrimSegment[],
  hasAudio: boolean
): { filter: string; vOut: string; aOut: string | null } {
  const parts: string[] = []
  const vLabels: string[] = []
  const aLabels: string[] = []
  segments.forEach((seg, i) => {
    parts.push(`[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS[v${i}]`)
    vLabels.push(`[v${i}]`)
    if (hasAudio) {
      parts.push(`[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`)
      aLabels.push(`[a${i}]`)
    }
  })
  if (hasAudio) {
    const chain = segments.map((_, i) => `${vLabels[i]}${aLabels[i]}`).join('')
    parts.push(`${chain}concat=n=${segments.length}:v=1:a=1[outv][outa]`)
    return { filter: parts.join(';'), vOut: '[outv]', aOut: '[outa]' }
  }
  const chain = vLabels.join('')
  parts.push(`${chain}concat=n=${segments.length}:v=1:a=0[outv]`)
  return { filter: parts.join(';'), vOut: '[outv]', aOut: null }
}

/** Cuts a video down to one or more kept [start,end] ranges and stitches
 *  them into a single output (re-encodes for frame-accurate cuts). */
export async function trimSegments(
  input: string,
  output: string,
  segments: TrimSegment[]
): Promise<void> {
  const ordered = [...segments].sort((a, b) => a.start - b.start)
  const hasAudio = await probeHasAudio(input)
  const { filter, vOut, aOut } = buildTrimConcatFilter(ordered, hasAudio)

  const args = ['-y', '-i', input, '-filter_complex', filter, '-map', vOut]
  if (aOut) args.push('-map', aOut)
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p')
  if (aOut) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-movflags', '+faststart', output)
  await run(args)
}

/** Export a GIF stitched from one or more kept [start,end] ranges, using a
 *  two-pass palette for quality. */
export async function exportGifSegments(
  input: string,
  output: string,
  segments: TrimSegment[],
  fps = 12,
  width = 720
): Promise<void> {
  const ordered = [...segments].sort((a, b) => a.start - b.start)
  const { filter: trimFilter, vOut } = buildTrimConcatFilter(ordered, false)
  const filter =
    `${trimFilter};${vOut}fps=${fps},scale=${width}:-1:flags=lanczos,split[ga][gb];` +
    `[ga]palettegen[gp];[gb][gp]paletteuse[outg]`
  await run(['-y', '-i', input, '-filter_complex', filter, '-map', '[outg]', output])
}

/** Extract mono 16k WAV audio for the local transcription model. */
export async function extractAudioForTranscription(
  input: string,
  outputWav: string
): Promise<void> {
  await run(['-y', '-i', input, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', outputWav])
}

export interface CaptionStyle {
  fontSize: number
  color: string
  position: 'top' | 'middle' | 'bottom'
}

// ASS/libass numpad-style alignment codes.
const CAPTION_ALIGNMENT: Record<CaptionStyle['position'], number> = {
  bottom: 2,
  middle: 5,
  top: 8
}

/** ffmpeg's filtergraph mini-language treats backslash, colon, and single
 *  quote as syntax — all three show up routinely in a Windows path (drive
 *  letter colon, backslash separators), so they have to be escaped before
 *  being embedded as a filter option value. */
function escapeFilterPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

/** Converts a #RRGGBB hex color into libass's &HAABBGGRR format (alpha then
 *  blue/green/red — reversed from CSS order) used by the subtitles filter's
 *  force_style override. Alpha is always opaque; this only controls hue. */
function hexToAssColor(hex: string): string {
  const clean = hex.replace('#', '')
  const r = clean.slice(0, 2)
  const g = clean.slice(2, 4)
  const b = clean.slice(4, 6)
  return `&H00${b}${g}${r}`
}

/** Burns an SRT transcript into the video as permanent captions, styled via
 *  libass's force_style override (the same styling language ASS subtitle
 *  files use). Re-encodes video — required for any filter — but copies
 *  audio through untouched, since captions never touch it. */
export async function burnCaptions(
  input: string,
  srtPath: string,
  output: string,
  style: CaptionStyle
): Promise<void> {
  const color = hexToAssColor(style.color)
  const forceStyle =
    `FontName=Inter,FontSize=${style.fontSize},PrimaryColour=${color},` +
    `OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=0,` +
    `Alignment=${CAPTION_ALIGNMENT[style.position]},MarginV=40`
  const filter = `subtitles=filename='${escapeFilterPath(srtPath)}':force_style='${forceStyle}'`

  await run([
    '-y',
    '-i',
    input,
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    DEFAULT_QUALITY.preset,
    '-crf',
    String(DEFAULT_QUALITY.crf),
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    output
  ])
}
