import sharp from 'sharp'
import { writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// electron-builder's NSIS integration only accepts BMP for installerSidebar/
// installerHeader, but sharp (libvips) can't encode BMP — it's PNG/JPEG/WebP/
// TIFF/etc. only. Rendering to a raw RGB buffer and wrapping it in a minimal
// hand-written 24bpp BITMAPINFOHEADER is simpler than pulling in a whole
// second image library just for this one format.
function encodeBmp(width, height, rgbBuffer) {
  const rowSize = width * 3
  const rowPadded = Math.ceil(rowSize / 4) * 4
  const pixelArraySize = rowPadded * height
  const fileSize = 54 + pixelArraySize
  const buf = Buffer.alloc(fileSize)

  buf.write('BM', 0, 'ascii')
  buf.writeUInt32LE(fileSize, 2)
  buf.writeUInt32LE(0, 6)
  buf.writeUInt32LE(54, 10)

  buf.writeUInt32LE(40, 14)
  buf.writeInt32LE(width, 18)
  buf.writeInt32LE(height, 22) // positive height = bottom-up row order
  buf.writeUInt16LE(1, 26)
  buf.writeUInt16LE(24, 28)
  buf.writeUInt32LE(0, 30)
  buf.writeUInt32LE(pixelArraySize, 34)
  buf.writeInt32LE(2835, 38)
  buf.writeInt32LE(2835, 42)
  buf.writeUInt32LE(0, 46)
  buf.writeUInt32LE(0, 50)

  let offset = 54
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = y * rowSize
    for (let x = 0; x < width; x++) {
      const srcIdx = rowStart + x * 3
      buf[offset++] = rgbBuffer[srcIdx + 2] // B
      buf[offset++] = rgbBuffer[srcIdx + 1] // G
      buf[offset++] = rgbBuffer[srcIdx] // R
    }
    for (let p = 0; p < rowPadded - rowSize; p++) buf[offset++] = 0
  }

  return buf
}

async function svgToBmp(svg, width, height, outPath) {
  const raw = await sharp(Buffer.from(svg)).resize(width, height).removeAlpha().raw().toBuffer()
  writeFileSync(outPath, encodeBmp(width, height, raw))
  console.log('wrote', outPath)
}

// NSIS MUI2 welcome/finish-page sidebar — 164x314, portrait.
const sidebar = `
<svg width="164" height="314" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#1c1e29"/>
      <stop offset="100%" stop-color="#0a0b0f"/>
    </linearGradient>
    <radialGradient id="orb" cx="38%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#9b81ff"/>
      <stop offset="55%" stop-color="#4D2FF5"/>
      <stop offset="100%" stop-color="#2c1899"/>
    </radialGradient>
  </defs>
  <rect width="164" height="314" fill="url(#bg)"/>
  <circle cx="82" cy="112" r="48" fill="url(#orb)"/>
  <text x="82" y="204" font-family="Segoe UI, Arial, sans-serif" font-size="27" font-weight="700" fill="#ffffff" text-anchor="middle">Beam</text>
  <text x="82" y="228" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#9d9ab0" text-anchor="middle">Screen recording,</text>
  <text x="82" y="244" font-family="Segoe UI, Arial, sans-serif" font-size="11" fill="#9d9ab0" text-anchor="middle">beautifully simple.</text>
  <rect x="42" y="270" width="80" height="2" rx="1" fill="#4D2FF5" opacity="0.7"/>
</svg>
`

// NSIS MUI2 interior-page header banner — 150x57, landscape, sits on the
// standard white page background so it should read as one continuous surface.
const header = `
<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="orb" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#9b81ff"/>
      <stop offset="60%" stop-color="#4D2FF5"/>
      <stop offset="100%" stop-color="#2c1899"/>
    </radialGradient>
  </defs>
  <rect width="150" height="57" fill="#ffffff"/>
  <circle cx="27" cy="28" r="15" fill="url(#orb)"/>
  <text x="52" y="35" font-family="Segoe UI, Arial, sans-serif" font-size="21" font-weight="700" fill="#15161c">Beam</text>
</svg>
`

async function main() {
  await svgToBmp(sidebar, 164, 314, join(__dirname, 'installerSidebar.bmp'))
  await svgToBmp(sidebar, 164, 314, join(__dirname, 'uninstallerSidebar.bmp'))
  await svgToBmp(header, 150, 57, join(__dirname, 'installerHeader.bmp'))
}

main()
