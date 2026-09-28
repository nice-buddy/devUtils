export const QR_FIXTURE_TEXT = 'DEVUTILS-1'
export const QR_FIXTURE_SIZE = 21
export const QR_FIXTURE_ROWS = [
  '111111100001101111111',
  '100000101101001000001',
  '101110101101101011101',
  '101110101001001011101',
  '101110100110101011101',
  '100000100011001000001',
  '111111101010101111111',
  '000000001100000000000',
  '100000101111011001110',
  '001111001101110010010',
  '111011100100101101010',
  '000110011001111010110',
  '100001110001111011001',
  '000000001010100110101',
  '111111100101010101000',
  '100000100010001101111',
  '101110100101010010110',
  '101110100001111010000',
  '101110100111110011011',
  '100000100111111011001',
  '111111101100100011100'
]

export function qrFixturePixels(
  scale = 8,
  quietZone = 4
): { data: Uint8ClampedArray; width: number; height: number } {
  const modules = QR_FIXTURE_SIZE + quietZone * 2
  const width = modules * scale
  const height = width
  const data = new Uint8ClampedArray(width * height * 4)
  data.fill(255)
  for (let y = 0; y < QR_FIXTURE_SIZE; y++) {
    for (let x = 0; x < QR_FIXTURE_SIZE; x++) {
      if (QR_FIXTURE_ROWS[y][x] !== '1') continue
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const px = (quietZone + x) * scale + dx
          const py = (quietZone + y) * scale + dy
          const offset = (py * width + px) * 4
          data[offset] = 0
          data[offset + 1] = 0
          data[offset + 2] = 0
          data[offset + 3] = 255
        }
      }
    }
  }
  return { data, width, height }
}
