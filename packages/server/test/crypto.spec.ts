import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { CryptoEngine } from '../src/crypto/crypto.engine.js';
import { unpackEnvelope } from '../src/crypto/envelope.js';
import { deriveKeys, generateSalt } from '../src/crypto/kdf.js';
import { VaultErrorCode } from '@personal-vault/shared';

describe('Cryptographic Engine & KDF Specification Tests', () => {
  let cryptoEngine: CryptoEngine;
  let testKey: Buffer;

  beforeEach(async () => {
    cryptoEngine = new CryptoEngine();
    const salt = generateSalt();
    const { masterKey } = await deriveKeys('test-master-password-123!', salt);
    testKey = masterKey;
    cryptoEngine.setMasterKey(testKey);
  });

  it('performs clean encryption and decryption round trips on text and binary data', () => {
    const textData = Buffer.from('Confidential report content: MCA Project 2026', 'utf8');
    const binaryData = crypto.randomBytes(1024 * 64); // 64KB random binary bytes

    // Text round trip
    const textEnc = cryptoEngine.encrypt(textData, '/notes/report.txt');
    const textDec = cryptoEngine.decrypt(textEnc.envelope, '/notes/report.txt');
    expect(textDec.toString('utf8')).toBe(textData.toString('utf8'));

    // Binary round trip
    const binEnc = cryptoEngine.encrypt(binaryData, '/images/diagram.png');
    const binDec = cryptoEngine.decrypt(binEnc.envelope, '/images/diagram.png');
    expect(binDec.equals(binaryData)).toBe(true);
  });

  it('generates a unique IV for every single encryption operation (never reuses nonces)', () => {
    const data = Buffer.from('Identical plaintext message', 'utf8');
    const enc1 = cryptoEngine.encrypt(data, '/msg.txt');
    const enc2 = cryptoEngine.encrypt(data, '/msg.txt');

    const unpacked1 = unpackEnvelope(enc1.envelope);
    const unpacked2 = unpackEnvelope(enc2.envelope);

    expect(unpacked1.iv.equals(unpacked2.iv)).toBe(false);
    expect(unpacked1.ciphertext.equals(unpacked2.ciphertext)).toBe(false);
  });

  it('fails authentication tag verification if ciphertext is tampered with (even a single bit)', () => {
    const data = Buffer.from('Sensitive bank transaction notes', 'utf8');
    const { envelope } = cryptoEngine.encrypt(data, '/secret.txt');

    // Flip the last byte of the envelope (which is part of the ciphertext)
    const tampered = Buffer.from(envelope);
    tampered[tampered.length - 1] ^= 0x01;

    expect(() => cryptoEngine.decrypt(tampered, '/secret.txt')).toThrowError();
    try {
      cryptoEngine.decrypt(tampered, '/secret.txt');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.INTEGRITY_CHECK_FAILED);
    }
  });

  it('fails authentication tag verification if Additional Authenticated Data (path) is altered', () => {
    const data = Buffer.from('Payload bound to path A', 'utf8');
    const { envelope } = cryptoEngine.encrypt(data, '/original/path.txt');

    // Attempt to decrypt under a different path (simulating a path-swap or replay attack)
    expect(() => cryptoEngine.decrypt(envelope, '/swapped/path.txt')).toThrowError();
    try {
      cryptoEngine.decrypt(envelope, '/swapped/path.txt');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.INTEGRITY_CHECK_FAILED);
    }
  });

  it('demonstrates that encrypted files are completely unreadable without the correct master key', async () => {
    const sensitivePlaintext = 'API_SECRET_KEY=super_confidential_token_98765';
    const { envelope } = cryptoEngine.encrypt(Buffer.from(sensitivePlaintext), '/credentials.env');

    // Ciphertext must not contain plaintext string anywhere
    expect(envelope.includes(Buffer.from(sensitivePlaintext))).toBe(false);

    // Another crypto engine with a wrong key must fail decryption
    const wrongEngine = new CryptoEngine();
    const wrongSalt = generateSalt();
    const { masterKey: wrongKey } = await deriveKeys('completely-wrong-password-999', wrongSalt);
    wrongEngine.setMasterKey(wrongKey);

    expect(() => wrongEngine.decrypt(envelope, '/credentials.env')).toThrowError();
    try {
      wrongEngine.decrypt(envelope, '/credentials.env');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.INTEGRITY_CHECK_FAILED);
    }
  });

  it('refuses operations when vault is locked', () => {
    cryptoEngine.lock();
    expect(cryptoEngine.isUnlocked()).toBe(false);

    expect(() => cryptoEngine.encrypt(Buffer.from('hello'), '/test.txt')).toThrowError();
    expect(() => cryptoEngine.decrypt(Buffer.from('dummy'), '/test.txt')).toThrowError();
  });
});
