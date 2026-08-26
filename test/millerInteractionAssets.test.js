import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

function alphaStats(file) {
  const source = fs.readFileSync(file)
  let offset = 8, width, height, bitDepth, colorType, interlace, idat = []
  while (offset < source.length) {
    const length = source.readUInt32BE(offset); offset += 4
    const type = source.subarray(offset, offset + 4).toString('ascii'); offset += 4
    const payload = source.subarray(offset, offset + length); offset += length + 4
    if (type === 'IHDR') { width = payload.readUInt32BE(0); height = payload.readUInt32BE(4); bitDepth = payload[8]; colorType = payload[9]; interlace = payload[12] }
    if (type === 'IDAT') idat.push(payload)
  }
  assert.equal(bitDepth, 8); assert.equal(colorType, 6); assert.equal(interlace, 0)
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = width * 4
  let prior = Buffer.alloc(stride), cursor = 0, transparent = 0, visible = 0
  const corners = []
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
  for (let y = 0; y < height; y++) {
    const filter = raw[cursor++], row = Buffer.from(raw.subarray(cursor, cursor + stride)); cursor += stride
    for (let x = 0; x < stride; x++) {
      const left = x >= 4 ? row[x - 4] : 0, up = prior[x], upperLeft = x >= 4 ? prior[x - 4] : 0
      if (filter === 1) row[x] = (row[x] + left) & 255
      else if (filter === 2) row[x] = (row[x] + up) & 255
      else if (filter === 3) row[x] = (row[x] + Math.floor((left + up) / 2)) & 255
      else if (filter === 4) row[x] = (row[x] + paeth(left, up, upperLeft)) & 255
      else assert.equal(filter, 0)
    }
    for (let x = 0; x < width; x++) {
      const alpha = row[x * 4 + 3]
      if (alpha === 0) transparent++; else visible++
      if ((x === 0 || x === width - 1) && (y === 0 || y === height - 1)) corners.push(alpha)
    }
    prior = row
  }
  return { width, height, transparent, visible, corners }
}

test('Classic interaction production poses are independently bounded RGBA cutouts with transparent background pixels', () => {
  const directory = path.resolve('src/assets/miller/interaction')
  for (const asset of ['classic-miller-notice-dog.png', 'classic-miller-lean-reach.png', 'classic-miller-pet-dog.png']) {
    const stats = alphaStats(path.join(directory, asset))
    assert.ok(stats.transparent > 0, `${asset} must contain alpha-zero background pixels`)
    assert.ok(stats.visible > 0, `${asset} must contain Miller pixels`)
    assert.ok(stats.width <= 360 && stats.height <= 604, `${asset} must be a pose cutout, not the source sheet`)
    assert.deepEqual(stats.corners, [0, 0, 0, 0], `${asset} must not retain a source-sheet matte at its bounds`)
  }
})
