import { defaultRng, type Rng } from './random'

// 1582-10-15 到 1970-01-01 之间的 100ns 数
const UUID_EPOCH_OFFSET = 122192928000000000n

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

function format(bytes: Uint8Array): string {
  const h = hex(bytes)
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function uuidV4(rng: Rng = defaultRng): string {
  const bytes = new Uint8Array(16)
  rng(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return format(bytes)
}

export function uuidV7(now: number = Date.now(), rng: Rng = defaultRng): string {
  const bytes = new Uint8Array(16)
  rng(bytes)
  let ts = BigInt(Math.floor(now))
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = Number(ts & 0xffn)
    ts >>= 8n
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  return format(bytes)
}

export function uuidV1(now: number = Date.now(), rng: Rng = defaultRng): string {
  const rand = new Uint8Array(8)
  rng(rand)
  const timestamp = UUID_EPOCH_OFFSET + BigInt(Math.floor(now)) * 10000n
  const timeLow = Number(timestamp & 0xffffffffn)
  const timeMid = Number((timestamp >> 32n) & 0xffffn)
  const timeHi = Number((timestamp >> 48n) & 0x0fffn)
  const clockSeq = ((rand[0] << 8) | rand[1]) & 0x3fff
  const bytes = new Uint8Array(16)
  bytes[0] = (timeLow >>> 24) & 0xff
  bytes[1] = (timeLow >>> 16) & 0xff
  bytes[2] = (timeLow >>> 8) & 0xff
  bytes[3] = timeLow & 0xff
  bytes[4] = (timeMid >>> 8) & 0xff
  bytes[5] = timeMid & 0xff
  bytes[6] = ((timeHi >>> 8) & 0x0f) | 0x10
  bytes[7] = timeHi & 0xff
  bytes[8] = ((clockSeq >>> 8) & 0x3f) | 0x80
  bytes[9] = clockSeq & 0xff
  for (let i = 0; i < 6; i += 1) bytes[10 + i] = rand[2 + (i % 6)]
  bytes[10] |= 0x01
  return format(bytes)
}
