export type ExpiryLevel = 'ok' | 'soon' | 'expired'

const OID_LABELS: Record<string, string> = {
  '1.2.840.113549.1.1.1': 'RSA',
  '1.2.840.113549.1.1.5': 'SHA1withRSA',
  '1.2.840.113549.1.1.11': 'SHA256withRSA',
  '1.2.840.113549.1.1.12': 'SHA384withRSA',
  '1.2.840.113549.1.1.13': 'SHA512withRSA',
  '1.2.840.10045.2.1': 'EC',
  '1.2.840.10045.4.3.2': 'ECDSA-with-SHA256',
  '1.3.101.112': 'Ed25519'
}

const SOON_THRESHOLD_DAYS = 30

export function expiryLevel(daysRemaining: number): ExpiryLevel {
  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= SOON_THRESHOLD_DAYS) return 'soon'
  return 'ok'
}

export function formatFingerprint(hex: string): string {
  const compact = hex.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
  if (!compact) return ''
  return compact.match(/.{1,2}/g)?.join(':') ?? ''
}

export function formatPublicKey(algorithm: string, bits: number | null): string {
  const label = oidLabel(algorithm)
  return bits && bits > 0 ? `${label} · ${bits} bit` : label
}

export function oidLabel(oid: string): string {
  return OID_LABELS[oid] ?? oid
}
