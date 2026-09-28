export type Rng = (bytes: Uint8Array) => void

export const defaultRng: Rng = bytes => crypto.getRandomValues(bytes)

export function randomInt(rng: Rng, maxExclusive: number): number {
  if (maxExclusive <= 0) return 0
  const buf = new Uint8Array(4)
  rng(buf)
  const value = ((buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3]) >>> 0
  return value % maxExclusive
}

export function pick<T>(rng: Rng, items: T[]): T {
  return items[randomInt(rng, items.length)]
}
