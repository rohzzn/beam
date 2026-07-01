<div align="center">
  <img src="build/icon.png" width="88" height="88" alt="Beam" />
  <h1>Beam</h1>
  <p><strong>A free, local-first screen recorder for Windows.</strong></p>
  <p>Record your screen, a window, your webcam, and your mic — trim, export, and get an offline AI transcript. No account, no subscription, no cloud. Nothing ever leaves your PC.</p>
</div>

<br />

## Why

Tools like Loom and Screen Studio are great, but they're subscriptions, and your recordings pass through someone else's server on the way to your hard drive. Beam does the same job — entirely offline, for free, forever.

## Features

- **Full-screen, window, or custom region capture** — drag out exactly the area you want, with optional system audio (WASAPI loopback)
- **Webcam bubble** — composited automatically as a circular overlay, freely draggable and resizable (scroll to resize) while recording, and scaled to match your output resolution
- **Microphone recording**, pause/resume mid-recording
- **Global hotkey** — start, stop, from anywhere, even when Beam isn't focused (default `Alt+Shift+R`, rebindable)
- **Quality presets** — Standard / High / Maximum, controlling both the live capture bitrate and the final x264 encode (CRF + preset), so you control the file-size/quality trade-off
- **Custom output folder** — recordings save to `Videos/Beam` by default, or wherever you point them
- **Built-in editor** — multi-segment trim (split at the playhead, delete the parts you don't want, keep the rest), export to MP4 or GIF, or copy the finished file straight to your clipboard
- **Offline AI transcription** — a local Whisper model (via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js)) generates an `.srt` caption file next to your recording. No API key, no internet required; the model (~280 MB) downloads once and is cached locally.
- **Lives in your system tray** — lightweight and always one click away

## Download

Grab the latest Windows installer from the [Releases page](https://github.com/rohzzn/beam/releases/latest).

> macOS and Linux builds are planned — the app is already built with cross-platform Electron, see [Building](#building) below.

## Development

```bash
git clone https://github.com/rohzzn/beam.git
cd beam
npm install
npm run dev
```

### Building

```bash
npm run build:win    # Windows installer (.exe)
npm run build:mac    # macOS (.dmg)
npm run build:linux  # Linux (AppImage/deb/snap)
```

## How it's built

Electron + React + TypeScript, scaffolded with [`electron-vite`](https://electron-vite.org/).

- **Capture**: `desktopCapturer` + `getDisplayMedia` — no native screen-capture dependencies
- **Encoding**: a bundled `ffmpeg-static` binary handles webcam-bubble compositing, trimming, and GIF export
- **Privacy of the UI itself**: the floating control bar and webcam bubble windows use `setContentProtection(true)`, so Beam's own interface never leaks into your recordings
- **Transcription**: runs a local Whisper model entirely on-device via `@huggingface/transformers`

## Project structure

```
src/
  main/        Electron main process — windows, recording pipeline, ffmpeg, transcription
  preload/     Typed IPC bridge between main and renderer
  renderer/    React UI (Home, control bar, webcam bubble, editor)
landing/       Static marketing site (landing/index.html)
build/         App icons and packaging resources
```

## Contributing

Issues and PRs are welcome. This is an early, actively-developed project — expect things to move fast.

## License

TBD.
