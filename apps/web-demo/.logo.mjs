import { chromium } from 'playwright'
import fs from 'fs'

/**
 * The supplied logo is a JPEG: black wordmark + red "L" on an opaque white
 * background. On a matte-black UI that would show as a white box, so this
 * derives two transparent PNGs from it:
 *
 *   slam-logo-dark.png  — white wordmark, brand-red "L", for dark surfaces
 *   slam-logo-light.png — original ink, transparent background, for light ones
 *
 * Both are trimmed to the artwork's bounding box so they sit tight in layout.
 */
const src = 'data:image/jpeg;base64,' + fs.readFileSync('brand/slam-logo-source.jpg').toString('base64')

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const page = await browser.newPage()

const out = await page.evaluate(async (dataUrl) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()

  const c = document.createElement('canvas')
  c.width = img.naturalWidth
  c.height = img.naturalHeight
  const ctx = c.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, c.width, c.height)
  const p = d.data

  // Bounding box of everything that isn't background white.
  let minX = c.width, minY = c.height, maxX = -1, maxY = -1
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4
      if (!(p[i] > 232 && p[i + 1] > 232 && p[i + 2] > 232)) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }
  const pad = 2
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad)
  maxX = Math.min(c.width - 1, maxX + pad); maxY = Math.min(c.height - 1, maxY + pad)
  const w = maxX - minX + 1
  const h = maxY - minY + 1

  const render = (mode) => {
    const o = document.createElement('canvas')
    o.width = w
    o.height = h
    const octx = o.getContext('2d')
    const od = octx.createImageData(w, h)
    const q = od.data

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + minY) * c.width + (x + minX)) * 4
        const di = (y * w + x) * 4
        const r = p[si], g = p[si + 1], b = p[si + 2]

        // Luminance drives alpha: white background → transparent, ink → opaque.
        // Anti-aliased edge pixels get a partial alpha, so edges stay smooth.
        const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        const alpha = Math.round(Math.min(1, Math.max(0, (1 - lum) / 0.92)) * 255)
        if (alpha === 0) { q[di + 3] = 0; continue }

        // Is this ink red rather than black? Red channel clearly dominant.
        const isRed = r > 90 && r - Math.max(g, b) > 40

        if (mode === 'dark') {
          if (isRed) { q[di] = 239; q[di + 1] = 43; q[di + 2] = 60 }  // brand red
          else { q[di] = 255; q[di + 1] = 255; q[di + 2] = 255 }      // knock to white
        } else {
          if (isRed) { q[di] = 200; q[di + 1] = 16; q[di + 2] = 46 }
          else { q[di] = 8; q[di + 1] = 8; q[di + 2] = 10 }
        }
        q[di + 3] = alpha
      }
    }
    octx.putImageData(od, 0, 0)
    return o.toDataURL('image/png')
  }

  // The lockup is "SLAM" over a small tagline. At sidebar/chip sizes the
  // tagline turns to mush, so also cut a wordmark-only version at the widest
  // empty row between the two.
  const rowEmpty = (y) => {
    for (let x = 0; x < w; x++) {
      const i = ((y + minY) * c.width + (x + minX)) * 4
      if (!(p[i] > 232 && p[i + 1] > 232 && p[i + 2] > 232)) return false
    }
    return true
  }
  let gapStart = -1, gapLen = 0, bestStart = -1, bestLen = 0
  for (let y = Math.floor(h * 0.45); y < h; y++) {
    if (rowEmpty(y)) {
      if (gapStart < 0) gapStart = y
      gapLen++
      if (gapLen > bestLen) { bestLen = gapLen; bestStart = gapStart }
    } else {
      gapStart = -1
      gapLen = 0
    }
  }
  const cutAt = bestStart > 0 ? bestStart : h

  const crop = (dataUrl, height) =>
    new Promise((resolve) => {
      const i2 = new Image()
      i2.onload = () => {
        const o = document.createElement('canvas')
        o.width = w
        o.height = height
        o.getContext('2d').drawImage(i2, 0, 0)
        resolve(o.toDataURL('image/png'))
      }
      i2.src = dataUrl
    })

  const dark = render('dark')
  const light = render('light')
  return {
    dark,
    light,
    darkWordmark: await crop(dark, cutAt),
    w,
    h,
    cutAt,
  }
}, src)

const write = (name, dataUrl) =>
  fs.writeFileSync(`public/img/${name}`, Buffer.from(dataUrl.split(',')[1], 'base64'))

write('slam-logo-dark.png', out.dark)
write('slam-logo-light.png', out.light)
write('slam-wordmark-dark.png', out.darkWordmark)
console.log(`trimmed to ${out.w}x${out.h}; wordmark cut at ${out.cutAt}px`)
await browser.close()
