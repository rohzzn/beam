const TARGET_SAMPLE_RATE = 16000
// Whisper needs enough context to transcribe accurately — much shorter than
// this and it's mostly guessing; much longer and captions feel laggy. ~2.5s
// is the standard sweet spot for "near-live" chunked transcription.
const CHUNK_SECONDS = 2.5
const PROCESSOR_BUFFER_SIZE = 4096

/** Linear-interpolation resample. The AudioContext is asked for 16kHz, but
 *  some OS/driver combinations silently ignore that and hand back audio at
 *  the hardware's native rate anyway — feeding that straight to Whisper
 *  (which assumes 16kHz) would make speech sound sped up or slowed down to
 *  the model and produce garbage, so every chunk is resampled to the exact
 *  rate Whisper expects regardless of what the context actually gave us. */
function resampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_SAMPLE_RATE) return input
  const ratio = inputRate / TARGET_SAMPLE_RATE
  const outLength = Math.round(input.length / ratio)
  const output = new Float32Array(outLength)
  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio
    const i0 = Math.floor(srcPos)
    const i1 = Math.min(i0 + 1, input.length - 1)
    const frac = srcPos - i0
    output[i] = input[i0] * (1 - frac) + input[i1] * frac
  }
  return output
}

/** Taps a mic stream and ships ~2.5s rolling windows of 16kHz mono PCM to
 *  the main process for live transcription. Returns a cleanup function that
 *  tears down the audio graph — call it when the recording stops.
 *
 *  ScriptProcessorNode only fires its callback while connected through to
 *  an active destination, so the graph runs through a zero-gain node rather
 *  than directly to speakers — otherwise the user would hear their own mic
 *  played back in real time (and, worse, feed into system-audio capture). */
export function startLiveCaptionCapture(micStream: MediaStream): () => void {
  const audioContext = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE })
  const source = audioContext.createMediaStreamSource(micStream)
  const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1)
  const silence = audioContext.createGain()
  silence.gain.value = 0

  const targetChunkLength = Math.round(audioContext.sampleRate * CHUNK_SECONDS)
  let buffer = new Float32Array(0)
  // Tracks position in the recording's own timeline (roughly — capture
  // starts within a beat of the mic-only recorder itself) so the rough
  // background transcript lines up with the video well enough to be useful
  // as a starting point, without needing exact frame-accurate sync.
  let elapsed = 0

  processor.onaudioprocess = (e: AudioProcessingEvent): void => {
    const incoming = e.inputBuffer.getChannelData(0)
    const merged = new Float32Array(buffer.length + incoming.length)
    merged.set(buffer)
    merged.set(incoming, buffer.length)
    buffer = merged

    if (buffer.length >= targetChunkLength) {
      const chunkDuration = buffer.length / audioContext.sampleRate
      const chunk = resampleTo16k(buffer, audioContext.sampleRate)
      buffer = new Float32Array(0)
      // Float32Array.buffer is structured-cloneable — no manual
      // serialization needed to get raw PCM across the IPC boundary.
      window.beam.sendLiveCaptionChunk(chunk.buffer, elapsed, chunkDuration)
      elapsed += chunkDuration
    }
  }

  source.connect(processor)
  processor.connect(silence)
  silence.connect(audioContext.destination)

  return () => {
    processor.onaudioprocess = null
    source.disconnect()
    processor.disconnect()
    silence.disconnect()
    audioContext.close().catch(() => {})
  }
}
