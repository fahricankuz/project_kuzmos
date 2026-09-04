/**
 * Kuzmos · Kasa — Şifre hashleme.
 *
 * Apps Script'te bcrypt/scrypt yerleşik değildir, bu yüzden HMAC-SHA256'yı
 * kullanıcıya özel bir salt ile binlerce kez zincirleyerek (poor-man's
 * PBKDF2) kaba kuvvet saldırılarını yavaşlatıyoruz. Bu, tam bir PBKDF2/
 * bcrypt kadar güçlü değildir — daha yüksek güvenlik gerekiyorsa hash'leme
 * gerçek bir backend'e (örn. Cloud Function) taşınmalı — ama tek bir işletme
 * için düz metin/zayıf hash'e göre büyük bir iyileştirmedir.
 */

var PBKDF_ITERATIONS = 2000;

function randomSalt_() {
  return Utilities.getUuid() + Utilities.getUuid();
}

function hashPassword_(password, salt) {
  var value = String(password) + '::' + String(salt);
  for (var i = 0; i < PBKDF_ITERATIONS; i++) {
    var bytes = Utilities.computeHmacSha256Signature(value, salt);
    value = bytes
      .map(function (b) {
        return ('0' + (b & 0xff).toString(16)).slice(-2);
      })
      .join('');
  }
  return value;
}

function verifyPassword_(password, salt, hash) {
  if (!salt || !hash) return false;
  return hashPassword_(password, salt) === hash;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PBKDF_ITERATIONS: PBKDF_ITERATIONS,
    randomSalt_: randomSalt_,
    hashPassword_: hashPassword_,
    verifyPassword_: verifyPassword_
  };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
