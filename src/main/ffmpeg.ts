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
  const args = ['-y', '-i', inputWebm]
  if (region) {
    args.push('-vf', cropFilter(region))
  }
  args.push(
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
    `[1:v]scale=${bubbleSize}:${bubbleSize}:force_original_aspect_ratio=increase,` +
    `crop=${bubbleSize}:${bubbleSize},format=yuva420p,` +
    `geq=lum='p(X,Y)':a='${alphaExpr}'[circle];` +
    `[0:v][circle]overlay=${overlayPos}[out]`
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

export interface ZoomClick {
  time: number
  xFrac: number
  yFrac: number
}

function probeDuration(input: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, ['-i', input])
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', () => resolve(0))
    proc.on('close', () => {
      const match = /Duration: (\d+):(\d+):(\d+\.\d+)/.exec(stderr)
      if (!match) {
        resolve(0)
        return
      }
      const [, h, m, s] = match
      resolve(parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s))
    })
  })
}

function probeVideoDimensions(input: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const proc = spawn(FFMPEG_BIN, ['-i', input])
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', () => resolve({ width: 1920, height: 1080 }))
    proc.on('close', () => {
      const match = /, (\d{3,5})x(\d{3,5}) /.exec(stderr)
      if (!match) {
        resolve({ width: 1920, height: 1080 })
        return
      }
      resolve({ width: parseInt(match[1], 10), height: parseInt(match[2], 10) })
    })
  })
}

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
      resolve(match ? parseFloat(match[1]) : 30)
    })
  })
}

interface ZoomWindow {
  start: number
  end: number
  xFrac: number
  yFrac: number
}

interface ZoomTimelineSegment {
  start: number
  end: number
  /** null = full-frame; otherwise linearly interpolates the zoom amount
   *  (0 = full frame, 1 = fully zoomed in) from `from` to `to` across the
   *  segment's own local duration. */
  zoom: { xFrac: number; yFrac: number; from: number; to: number } | null
}

const ZOOM_LEVEL = 1.55
const ZOOM_LEAD_IN = 0.3
const ZOOM_TRAIL_OUT = 1.8
const ZOOM_EASE_DUR = 0.35
const ZOOM_MERGE_GAP = 3

/** Turns raw click timestamps into a full timeline covering [0, duration]:
 *  alternating full-frame segments and zoom segments (ease-in / hold /
 *  ease-out) centered on wherever the user was clicking. Nearby clicks are
 *  clustered into a single zoom window rather than zooming for every click. */
function buildZoomTimeline(clicks: ZoomClick[], duration: number): ZoomTimelineSegment[] {
  const sorted = [...clicks].sort((a, b) => a.time - b.time)

  const clusters: { first: number; last: number; xFrac: number; yFrac: number }[] = []
  for (const c of sorted) {
    const prev = clusters[clusters.length - 1]
    if (prev && c.time - prev.last <= ZOOM_MERGE_GAP) {
      prev.last = c.time
      prev.xFrac = c.xFrac
      prev.yFrac = c.yFrac
    } else {
      clusters.push({ first: c.time, last: c.time, xFrac: c.xFrac, yFrac: c.yFrac })
    }
  }

  const windows: ZoomWindow[] = []
  for (const c of clusters) {
    const start = Math.max(0, c.first - ZOOM_LEAD_IN)
    const end = Math.min(duration, c.last + ZOOM_TRAIL_OUT)
    if (end - start < 0.05) continue
    const prev = windows[windows.length - 1]
    if (prev && start <= prev.end) {
      prev.end = Math.max(prev.end, end)
      prev.xFrac = c.xFrac
      prev.yFrac = c.yFrac
    } else {
      windows.push({ start, end, xFrac: c.xFrac, yFrac: c.yFrac })
    }
  }

  const segments: ZoomTimelineSegment[] = []
  let cursor = 0
  for (const w of windows) {
    if (w.start > cursor) segments.push({ start: cursor, end: w.start, zoom: null })

    const winLen = w.end - w.start
    if (winLen <= 2 * ZOOM_EASE_DUR) {
      const mid = (w.start + w.end) / 2
      if (mid > w.start) {
        segments.push({ start: w.start, end: mid, zoom: { ...w, from: 0, to: 1 } })
      }
      if (w.end > mid) {
        segments.push({ start: mid, end: w.end, zoom: { ...w, from: 1, to: 0 } })
      }
    } else {
      segments.push({
        start: w.start,
        end: w.start + ZOOM_EASE_DUR,
        zoom: { ...w, from: 0, to: 1 }
      })
      segments.push({
        start: w.start + ZOOM_EASE_DUR,
        end: w.end - ZOOM_EASE_DUR,
        zoom: { ...w, from: 1, to: 1 }
      })
      segments.push({
        start: w.end - ZOOM_EASE_DUR,
        end: w.end,
        zoom: { ...w, from: 1, to: 0 }
      })
    }
    cursor = w.end
  }
  if (cursor < duration) segments.push({ start: cursor, end: duration, zoom: null })

  return segments.filter((s) => s.end - s.start > 0.02)
}

/** Applies a Ken-Burns-style auto-zoom to an already-composited recording,
 *  zooming in around click activity and back out during quiet stretches.
 *  Falls back to a plain copy-through if there's nothing worth zooming to. */
export async function applyAutoZoom(
  input: string,
  output: string,
  clicks: ZoomClick[]
): Promise<void> {
  const [duration, { width, height }, fps, hasAudio] = await Promise.all([
    probeDuration(input),
    probeVideoDimensions(input),
    probeFps(input),
    probeHasAudio(input)
  ])

  if (duration <= 0) {
    throw new Error('could not determine video duration for auto-zoom')
  }

  const timeline = buildZoomTimeline(clicks, duration)
  if (!timeline.some((s) => s.zoom)) {
    // Nothing landed inside the video's actual duration — just pass through.
    await run(['-y', '-i', input, '-c', 'copy', output])
    return
  }

  const parts: string[] = []
  const vLabels: string[] = []
  const aLabels: string[] = []

  timeline.forEach((seg, i) => {
    const segDur = seg.end - seg.start
    let vChain = `[0:v]trim=start=${seg.start}:end=${seg.end},setpts=PTS-STARTPTS`
    if (seg.zoom) {
      // crop's own w/h can't vary per-frame (ffmpeg needs a fixed output
      // pad size to configure the filter graph), so a continuously
      // animated zoom has to go through zoompan instead — it's built for
      // exactly this and keeps a constant `s` output size regardless of
      // how the internal zoom/crop varies frame to frame.
      const { xFrac, yFrac, from, to } = seg.zoom
      const segFrames = Math.max(1, Math.round(segDur * fps))
      const progress = `(on/${segFrames})`
      const zoomAmt = `(${from}+(${(to - from).toFixed(4)})*${progress})`
      const zoomExpr = `1+${zoomAmt}*${(ZOOM_LEVEL - 1).toFixed(4)}`
      const xExpr = `min(max(${xFrac.toFixed(4)}*iw-(iw/zoom)/2,0),iw-iw/zoom)`
      const yExpr = `min(max(${yFrac.toFixed(4)}*ih-(ih/zoom)/2,0),ih-ih/zoom)`
      vChain +=
        `,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=1:` +
        `s=${width}x${height}:fps=${fps}`
    }
    vChain += `[v${i}]`
    parts.push(vChain)
    vLabels.push(`[v${i}]`)

    if (hasAudio) {
      parts.push(`[0:a]atrim=start=${seg.start}:end=${seg.end},asetpts=PTS-STARTPTS[a${i}]`)
      aLabels.push(`[a${i}]`)
    }
  })

  let filter: string
  let vOut: string
  let aOut: string | null = null
  if (hasAudio) {
    const chain = timeline.map((_, i) => `${vLabels[i]}${aLabels[i]}`).join('')
    filter = `${parts.join(';')};${chain}concat=n=${timeline.length}:v=1:a=1[outv][outa]`
    vOut = '[outv]'
    aOut = '[outa]'
  } else {
    const chain = vLabels.join('')
    filter = `${parts.join(';')};${chain}concat=n=${timeline.length}:v=1:a=0[outv]`
    vOut = '[outv]'
  }

  const args = ['-y', '-i', input, '-filter_complex', filter, '-map', vOut]
  if (aOut) args.push('-map', aOut)
  args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p')
  if (aOut) args.push('-c:a', 'aac', '-b:a', '192k')
  args.push('-movflags', '+faststart', output)
  await run(args)
}
