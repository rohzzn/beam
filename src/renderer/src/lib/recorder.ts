export async function getScreenStream(systemAudio: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getDisplayMedia({
    video: true,
    audio: systemAudio
  } as MediaStreamConstraints)
}

export async function getMicStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: deviceId ? { deviceId: { exact: deviceId } } : true
  })
}

export async function getWebcamStream(deviceId?: string): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId
      ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 1280 } }
      : { width: { ideal: 1280 }, height: { ideal: 1280 } },
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
