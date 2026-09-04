const { installGasMocks } = require('./gasMocks');

installGasMocks();
require('../src/Crypto.js');

describe('hashPassword_ / verifyPassword_', () => {
  test('verifies the correct password', () => {
    const salt = randomSalt_();
    const hash = hashPassword_('gizliSifre123', salt);
    expect(verifyPassword_('gizliSifre123', salt, hash)).toBe(true);
  });

  test('rejects a wrong password', () => {
    const salt = randomSalt_();
    const hash = hashPassword_('gizliSifre123', salt);
    expect(verifyPassword_('yanlisSifre', salt, hash)).toBe(false);
  });

  test('the same password produces different hashes with different salts', () => {
    const saltA = randomSalt_();
    const saltB = randomSalt_();
    const hashA = hashPassword_('ayniSifre', saltA);
    const hashB = hashPassword_('ayniSifre', saltB);
    expect(hashA).not.toBe(hashB);
  });

  test('verifyPassword_ is false when salt or hash is missing', () => {
    expect(verifyPassword_('x', '', 'somehash')).toBe(false);
    expect(verifyPassword_('x', 'somesalt', '')).toBe(false);
  });

  test('randomSalt_ produces unique values', () => {
    const salts = new Set([randomSalt_(), randomSalt_(), randomSalt_()]);
    expect(salts.size).toBe(3);
  });
});
