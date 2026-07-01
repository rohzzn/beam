export async function getScreenStream(systemAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: systemAudio
  } as MediaStreamConstraints)
}

/** A saved deviceId comes from settings.json, which persists across app
 *  restarts, OS driver updates, and even machines (same Windows profile,
 *  different hardware). If that exact device no longer exists, `exact`
 *  constraints make getUserMedia throw OverconstrainedError instead of
 *  falling back — which, uncaught, was killing the entire recording start
 *  the instant the mic/webcam picker returned a stale id. Falling back to
 *  the default device keeps recording working instead of hard-failing. */
export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } }
      })
    } catch (err) {
      console.error('[beam] saved mic device unavailable, falling back to default', err)
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

export async function getWebcamStream(deviceId?: string): Promise<MediaStream> {
  if (deviceId) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 1280 } },
        audio: false
      })
    } catch (err) {
      console.error('[beam] saved webcam device unavailable, falling back to default', err)
    }
  }
  return navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 1280 } },
    audio: false
  })
}

/** Combine one video track with one or more audio sources (mixed via Web Audio). */
export function buildMixedStream(
  videoTrack: MediaStreamTrack | null,
  audioStreams: MediaStream[]
): { stream: MediaStream; audioContext: AudioContext | null } {
  const tracks: MediaStreamTrack[] = []
  if (videoTrack) tracks.push(videoTrack)

  const audioTracks = audioStreams.flatMap((s) => s.getAudioTracks())
  if (audioTracks.length === 0) {
    return { stream: new MediaStream(tracks), audioContext: null }
  }
  if (audioTracks.length === 1) {
    tracks.push(audioTracks[0])
    return { stream: new MediaStream(tracks), audioContext: null }
  }

  const audioContext = new AudioContext()
  const destination = audioContext.createMediaStreamDestination()
  for (const stream of audioStreams) {
    if (stream.getAudioTracks().length === 0) continue
    const source = audioContext.createMediaStreamSource(stream)
    source.connect(destination)
  }
  tracks.push(...destination.stream.getAudioTracks())
  return { stream: new MediaStream(tracks), audioContext }
}

const CANDIDATE_MIME_TYPES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm'
]

export function pickSupportedMimeType(): string {
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type
  }
  return 'video/webm'
}

export function createRecorder(
  stream: MediaStream,
  videoBitsPerSecond = 15_000_000
): MediaRecorder {
  return new MediaRecorder(stream, {
    mimeType: pickSupportedMimeType(),
    videoBitsPerSecond
  })
}

export function stopAllTracks(...streams: (MediaStream | null | undefined)[]): void {
  for (const s of streams) {
    s?.getTracks().forEach((t) => t.stop())
  }
}

export async function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  return blob.arrayBuffer()
}
