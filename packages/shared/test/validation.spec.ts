import { describe, it, expect } from 'vitest';
import { sanitizeVaultPath, validateMasterPassword } from '../src/validation.js';
import { VaultErrorCode } from '../src/errors.js';

describe('sanitizeVaultPath', () => {
  it('normalizes standard clean paths', () => {
    expect(sanitizeVaultPath('/documents/test.txt')).toBe('/documents/test.txt');
    expect(sanitizeVaultPath('notes/sub/file.md')).toBe('/notes/sub/file.md');
    expect(sanitizeVaultPath('/')).toBe('/');
  });

  it('resolves internal relative segments safely', () => {
    expect(sanitizeVaultPath('/folder/../file.txt')).toBe('/file.txt');
    expect(sanitizeVaultPath('/a/b/c/../../d.txt')).toBe('/a/d.txt');
  });

  it('blocks path traversal escaping root (../)', () => {
    expect(() => sanitizeVaultPath('../../../etc/passwd')).toThrowError();
    try {
      sanitizeVaultPath('/../../windows/system32');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.PATH_TRAVERSAL_DETECTED);
    }
  });

  it('rejects null byte injection', () => {
    expect(() => sanitizeVaultPath('/test\0.txt')).toThrowError();
    try {
      sanitizeVaultPath('/safe/path\0/escape');
    } catch (err: any) {
      expect(err.code).toBe(VaultErrorCode.PATH_TRAVERSAL_DETECTED);
    }
  });

  it('rejects Windows drive letters and UNC paths', () => {
    expect(() => sanitizeVaultPath('C:\\Windows\\System32')).toThrowError();
    expect(() => sanitizeVaultPath('\\\\server\\share\\file.txt')).toThrowError();
  });
});

describe('validateMasterPassword', () => {
  it('requires at least 12 characters', () => {
    expect(validateMasterPassword('short').valid).toBe(false);
    expect(validateMasterPassword('12345678901').valid).toBe(false);
    expect(validateMasterPassword('correct-horse-battery-staple').valid).toBe(true);
  });
});
