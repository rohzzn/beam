# Beam

A free, local-first screen recorder — record your screen, a window, your webcam bubble, and your mic, then trim and export, all without an account, a subscription, or a server. Nothing leaves your PC.

## Features

- Full-screen or single-window capture, with optional system audio (WASAPI loopback)
- Webcam bubble overlay (composited into the final video automatically)
- Microphone recording
- Pause/resume while recording
- Recording quality presets — Standard / High / Maximum — controlling both the live capture bitrate and the final x264 encode (CRF + preset), so you can trade file size against quality
- Post-record editor: trim, export to MP4 or GIF
- Local, offline AI transcription (Whisper, via `@huggingface/transformers`) — generates an `.srt` caption file next to your recording. No API key, no cloud, runs entirely on your machine. The model (~280 MB) downloads once on first use and is cached under the app's user data folder.
- Lives in the system tray; recordings save to your `Videos/Beam` folder

## Project Setup

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## How it's built

Electron + React + TypeScript (via `electron-vite`). Recording uses `desktopCapturer` + `getDisplayMedia` (no native screen-capture deps); video processing (overlay compositing, trim, GIF export) uses a bundled `ffmpeg-static` binary. The control bar and webcam bubble windows use `setContentProtection(true)` so Beam's own UI never appears in your recordings.
