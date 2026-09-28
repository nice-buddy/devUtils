import { invoke } from '@tauri-apps/api/core'

export interface NameFields {
  commonName?: string
  organization: string[]
  organizationalUnit: string[]
  country: string[]
  state: string[]
  locality: string[]
  email: string[]
  raw: string
}

export interface Fingerprints {
  sha1: string
  sha256: string
}

export interface CertificateInfo {
  subject: NameFields
  issuer: NameFields
  serialHex: string
  version: string
  notBefore: string
  notAfter: string
  daysRemaining: number
  isExpired: boolean
  signatureAlgorithm: string
  publicKeyAlgorithm: string
  publicKeyBits: number | null
  subjectAltNames: string[]
  keyUsage: string[]
  extendedKeyUsage: string[]
  isCa: boolean
  pathLenConstraint: number | null
  selfSigned: boolean
  fingerprints: Fingerprints
  derHex: string
  pem: string
}

export function parseCertificate(input: string): Promise<CertificateInfo> {
  return invoke<CertificateInfo>('parse_certificate', { input })
}
