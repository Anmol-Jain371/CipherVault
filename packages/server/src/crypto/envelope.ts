import {
  ENVELOPE_MAGIC,
  ENVELOPE_FORMAT_VERSION,
  NONCE_LENGTH_BYTES,
  AUTH_TAG_LENGTH_BYTES,
  VaultError,
  VaultErrorCode,
} from '@personal-vault/shared';

export const HEADER_LENGTH_BYTES = 4 + 1 + NONCE_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES + 4; // 37 bytes

export interface UnpackedEnvelope {
  version: number;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
}

/**
 * Packs encrypted ciphertext, IV, and authentication tag into a binary envelope.
 * 
 * Header layout:
 * [0..3]   Magic Bytes ("PVLT")
 * [4]      Version Byte (1)
 * [5..16]  IV / Nonce (12 bytes)
 * [17..32] Auth Tag (16 bytes)
 * [33..36] Payload Length (4 bytes, Big-Endian uint32)
 * [37..N]  Ciphertext
 */
export function packEnvelope(
  iv: Buffer,
  authTag: Buffer,
  ciphertext: Buffer
): Buffer {
  if (iv.length !== NONCE_LENGTH_BYTES) {
    throw new VaultError(
      VaultErrorCode.INTERNAL_ERROR,
      `Invalid IV length: expected ${NONCE_LENGTH_BYTES}, got ${iv.length}`
    );
  }
  if (authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new VaultError(
      VaultErrorCode.INTERNAL_ERROR,
      `Invalid auth tag length: expected ${AUTH_TAG_LENGTH_BYTES}, got ${authTag.length}`
    );
  }

  const envelope = Buffer.allocUnsafe(HEADER_LENGTH_BYTES + ciphertext.length);

  // 1. Magic
  ENVELOPE_MAGIC.copy(envelope, 0);

  // 2. Version
  envelope.writeUInt8(ENVELOPE_FORMAT_VERSION, 4);

  // 3. IV
  iv.copy(envelope, 5);

  // 4. Tag
  authTag.copy(envelope, 5 + NONCE_LENGTH_BYTES);

  // 5. Length
  envelope.writeUInt32BE(ciphertext.length, 5 + NONCE_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES);

  // 6. Ciphertext
  ciphertext.copy(envelope, HEADER_LENGTH_BYTES);

  return envelope;
}

/**
 * Unpacks and validates a binary envelope header.
 */
export function unpackEnvelope(buffer: Buffer): UnpackedEnvelope {
  if (buffer.length < HEADER_LENGTH_BYTES) {
    throw new VaultError(
      VaultErrorCode.INTEGRITY_CHECK_FAILED,
      'Invalid envelope: buffer is smaller than minimum header size'
    );
  }

  // Verify Magic
  if (!buffer.subarray(0, 4).equals(ENVELOPE_MAGIC)) {
    throw new VaultError(
      VaultErrorCode.INTEGRITY_CHECK_FAILED,
      'Invalid envelope: file does not match Personal Vault magic header'
    );
  }

  // Verify Version
  const version = buffer.readUInt8(4);
  if (version !== ENVELOPE_FORMAT_VERSION) {
    throw new VaultError(
      VaultErrorCode.INTEGRITY_CHECK_FAILED,
      `Unsupported envelope version: ${version} (expected ${ENVELOPE_FORMAT_VERSION})`
    );
  }

  const iv = buffer.subarray(5, 5 + NONCE_LENGTH_BYTES);
  const authTag = buffer.subarray(
    5 + NONCE_LENGTH_BYTES,
    5 + NONCE_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
  );
  const payloadLength = buffer.readUInt32BE(
    5 + NONCE_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES
  );

  const ciphertext = buffer.subarray(HEADER_LENGTH_BYTES);
  if (ciphertext.length !== payloadLength) {
    throw new VaultError(
      VaultErrorCode.INTEGRITY_CHECK_FAILED,
      `Envelope payload truncated or corrupt: expected ${payloadLength} bytes, found ${ciphertext.length}`
    );
  }

  return {
    version,
    iv: Buffer.from(iv),
    authTag: Buffer.from(authTag),
    ciphertext: Buffer.from(ciphertext),
  };
}
