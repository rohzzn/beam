import sharp from 'sharp'
import png2icons from 'png2icons'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svgPath = join(__dirname, 'icon-source.svg')
const svgBuffer = readFileSync(svgPath)

async function main() {
  const png1024 = await sharp(svgBuffer, { density: 384 }).resize(1024, 1024).png().toBuffer()
  writeFileSync(join(__dirname, 'icon.png'), png1024)
  writeFileSync(join(__dirname, '..', 'resources', 'icon.png'), png1024)

  const ico = png2icons.createICO(png1024, png2icons.BILINEAR, 0, false, true)
  if (ico) writeFileSync(join(__dirname, 'icon.ico'), ico)

  const icns = png2icons.createICNS(png1024, png2icons.BILINEAR, 0)
  if (icns) writeFileSync(join(__dirname, 'icon.icns'), icns)

  console.log('Icons generated: icon.png, icon.ico, icon.icns')
}

main()
