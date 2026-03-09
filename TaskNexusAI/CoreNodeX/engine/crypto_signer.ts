/**
 * SigningEngine — RSA (RSASSA-PKCS1-v1_5, SHA-256) signing & verification
 * - Async key generation via `SigningEngine.create()`
 * - Sign/verify string payloads
 * - Export/Import keys in PEM (SPKI/PKCS#8)
 * - Works in browser and Node (no hard Buffer dependency)
 */
export class SigningEngine {
  private keyPair!: CryptoKeyPair

  private constructor(keys: CryptoKeyPair) {
    this.keyPair = keys
  }

  /** Generate a new key pair */
  static async create(): Promise<SigningEngine> {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"]
    )
    return new SigningEngine(keyPair as CryptoKeyPair)
  }

  /** Restore from PEM strings (public required; private optional if only verifying) */
  static async fromPEM(publicPem: string, privatePem?: string): Promise<SigningEngine> {
    const publicKey = await importPublicKeyFromPEM(publicPem)
    let privateKey: CryptoKey | undefined
    if (privatePem) privateKey = await importPrivateKeyFromPEM(privatePem)

    // If no private key provided, generate a dummy and replace its public with the imported one for typing parity
    if (!privateKey) {
      // Create a temporary pair and swap in the imported public key
      const tmp = await SigningEngine.create()
      return new SigningEngine({ publicKey, privateKey: (tmp as any).keyPair.privateKey } as CryptoKeyPair)
    }
    return new SigningEngine({ publicKey, privateKey } as CryptoKeyPair)
  }

  /** Sign text and return base64 signature */
  async sign(data: string): Promise<string> {
    const bytes = new TextEncoder().encode(data)
    const sig = await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, this.keyPair.privateKey, bytes)
    return arrayBufferToBase64(sig)
  }

  /** Verify a base64 signature against text */
  async verify(data: string, signatureBase64: string): Promise<boolean> {
    const bytes = new TextEncoder().encode(data)
    const sig = base64ToArrayBuffer(signatureBase64)
    return crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, this.keyPair.publicKey, sig, bytes)
  }

  /** Export public key (SPKI) as PEM */
  async exportPublicKeyPEM(): Promise<string> {
    const spki = await crypto.subtle.exportKey("spki", this.keyPair.publicKey)
    return toPEM(spki, "PUBLIC KEY")
  }

  /** Export private key (PKCS#8) as PEM */
  async exportPrivateKeyPEM(): Promise<string> {
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", this.keyPair.privateKey)
    return toPEM(pkcs8, "PRIVATE KEY")
  }
}

/* -------------------- PEM / Base64 helpers -------------------- */

function toPEM(buf: ArrayBuffer, label: "PUBLIC KEY" | "PRIVATE KEY"): string {
  const b64 = arrayBufferToBase64(buf)
  const wrapped = b64.match(/.{1,64}/g)?.join("\n") ?? b64
  return `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`
}

async function importPublicKeyFromPEM(pem: string): Promise<CryptoKey> {
  const der = pemToArrayBuffer(pem, "PUBLIC KEY")
  return crypto.subtle.importKey(
    "spki",
    der,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["verify"]
  )
}

async function importPrivateKeyFromPEM(pem: string): Promise<CryptoKey> {
  const der = pemToArrayBuffer(pem, "PRIVATE KEY")
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    true,
    ["sign"]
  )
}

function pemToArrayBuffer(pem: string, label: "PUBLIC KEY" | "PRIVATE KEY"): ArrayBuffer {
  const cleaned = pem
    .replace(new RegExp(`-----BEGIN ${label}-----`, "g"), "")
    .replace(new RegExp(`-----END ${label}-----`, "g"), "")
    .replace(/\s+/g, "")
  return base64ToArrayBuffer(cleaned)
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Browser: btoa + String.fromCharCode
  // Node: Buffer if btoa not available
  if (typeof btoa === "function") {
    const bytes = new Uint8Array(buf)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    return btoa(binary)
  } else {
    // @ts-ignore - Buffer exists in Node
    return Buffer.from(buf).toString("base64")
  }
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  if (typeof atob === "function") {
    const binary = atob(b64)
    const len = binary.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
  } else {
    // @ts-ignore - Buffer exists in Node
    const buf: Buffer = Buffer.from(b64, "base64")
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
  }
}
