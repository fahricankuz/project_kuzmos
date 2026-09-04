/**
 * Kuzmos · Kasa — Kimlik doğrulama ve kullanıcı yönetimi.
 *
 * Eski sürümde tek bir ortak şifre vardı. Burada her kullanıcının kendi
 * e-posta/şifresi var; oturumlar CacheService'te tutulur (6 saat), başarısız
 * girişler kısa süreli kilitlenir, ve yönetici (admin) rolü kullanıcı
 * ekleyip pasif hale getirebilir.
 */

var SESSION_TTL_SECONDS = 21600; /* 6 saat */
var LOGIN_LOCK_THRESHOLD = 5;
var LOGIN_LOCK_WINDOW_SECONDS = 900; /* 15 dakika */

function kullaniciSheet_() {
  return sheet_(SHEET_NAMES.KULLANICI, [
    'Email',
    'Ad',
    'SifreHash',
    'Salt',
    'Rol',
    'Aktif',
    'OlusturulmaZamani',
    'SonGirisZamani'
  ]);
}

function kullaniciSayisi_() {
  return Math.max(0, kullaniciSheet_().getLastRow() - 1);
}

function kullaniciBul_(email) {
  var emailNorm = cln_(email).toLowerCase();
  if (!emailNorm) return null;
  var s = kullaniciSheet_();
  var d = s.getDataRange().getValues();
  for (var i = 1; i < d.length; i++) {
    if (String(d[i][0]).trim().toLowerCase() === emailNorm) {
      return {
        row: i + 1,
        email: d[i][0],
        ad: d[i][1],
        sifreHash: d[i][2],
        salt: d[i][3],
        rol: d[i][4] || 'personel',
        aktif: String(d[i][5]).toLowerCase() !== 'false'
      };
    }
  }
  return null;
}

function kullaniciEkle_(email, ad, sifre, rol) {
  var salt = randomSalt_();
  var hash = hashPassword_(sifre, salt);
  kullaniciSheet_().appendRow([
    cln_(email).toLowerCase(),
    cln_(ad),
    hash,
    salt,
    rol === 'admin' ? 'admin' : 'personel',
    true,
    new Date(),
    ''
  ]);
}

function kullaniciSonGirisGuncelle_(row) {
  kullaniciSheet_().getRange(row, 8).setValue(new Date());
}

function kullaniciSifreGuncelle_(row, sifre) {
  var salt = randomSalt_();
  var hash = hashPassword_(sifre, salt);
  var s = kullaniciSheet_();
  s.getRange(row, 3).setValue(hash);
  s.getRange(row, 4).setValue(salt);
}

/* ── giriş denemesi kilitleme ── */
function loginDenemeAnahtari_(email) {
  return 'lgn_' + cln_(email).toLowerCase();
}
function loginKilitliMi_(email) {
  var v = CacheService.getScriptCache().get(loginDenemeAnahtari_(email));
  return !!v && parseInt(v, 10) >= LOGIN_LOCK_THRESHOLD;
}
function loginBasarisiz_(email) {
  var c = CacheService.getScriptCache();
  var k = loginDenemeAnahtari_(email);
  var n = parseInt(c.get(k) || '0', 10) + 1;
  c.put(k, String(n), LOGIN_LOCK_WINDOW_SECONDS);
}
function loginBasariliSifirla_(email) {
  CacheService.getScriptCache().remove(loginDenemeAnahtari_(email));
}

/* ── oturum ── */
function girisYap(email, sifre) {
  email = cln_(email);
  if (!email || !sifre) return { ok: false, hata: 'E-posta ve şifre gerekli.' };
  if (loginKilitliMi_(email)) {
    return { ok: false, hata: 'Çok fazla başarısız deneme. 15 dakika sonra tekrar deneyin.' };
  }
  var u = kullaniciBul_(email);
  if (!u || !u.aktif || !verifyPassword_(sifre, u.salt, u.sifreHash)) {
    loginBasarisiz_(email);
    return { ok: false, hata: 'E-posta veya şifre hatalı.' };
  }
  loginBasariliSifirla_(email);
  var token = Utilities.getUuid();
  var session = JSON.stringify({ email: u.email, ad: u.ad, rol: u.rol });
  CacheService.getScriptCache().put('tok_' + token, session, SESSION_TTL_SECONDS);
  kullaniciSonGirisGuncelle_(u.row);
  return { ok: true, token: token, ad: u.ad, rol: u.rol, email: u.email };
}

function oturumGetir_(token) {
  if (!token) return null;
  var raw = CacheService.getScriptCache().get('tok_' + token);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function guard_(token) {
  var s = oturumGetir_(token);
  if (!s) throw new Error('Oturum geçersiz. Tekrar giriş yapın.');
  return s;
}

function guardAdmin_(token) {
  var s = guard_(token);
  if (s.rol !== 'admin') throw new Error('Bu işlem için yönetici yetkisi gerekli.');
  return s;
}

function mevcutKullaniciGetir(token) {
  var s = guard_(token);
  return { email: s.email, ad: s.ad, rol: s.rol };
}

/* ── yönetici: kullanıcı yönetimi ── */
function kullaniciListele(token) {
  guardAdmin_(token);
  var s = kullaniciSheet_();
  var d = s.getDataRange().getValues();
  var out = [];
  for (var i = 1; i < d.length; i++) {
    if (!cln_(d[i][0])) continue;
    out.push({
      email: d[i][0],
      ad: d[i][1],
      rol: d[i][4] || 'personel',
      aktif: String(d[i][5]).toLowerCase() !== 'false',
      sonGiris: d[i][7] ? dstr_(d[i][7]) : ''
    });
  }
  return out;
}

function kullaniciEkleApi(token, kullanici) {
  guardAdmin_(token);
  var email = cln_(kullanici && kullanici.email).toLowerCase();
  var sifre = kullanici && kullanici.sifre;
  if (!email || !sifre) throw new Error('E-posta ve şifre gerekli.');
  if (String(sifre).length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
  if (kullaniciBul_(email)) throw new Error('Bu e-posta zaten kayıtlı.');
  kullaniciEkle_(email, kullanici.ad, sifre, kullanici.rol);
  return true;
}

function kullaniciDurumDegistir(token, email, aktif) {
  var admin = guardAdmin_(token);
  if (admin.email.toLowerCase() === cln_(email).toLowerCase() && !aktif) {
    throw new Error('Kendi hesabınızı pasif yapamazsınız.');
  }
  var u = kullaniciBul_(email);
  if (!u) throw new Error('Kullanıcı bulunamadı.');
  kullaniciSheet_().getRange(u.row, 6).setValue(!!aktif);
  return true;
}

function kullaniciSifreDegistirAdmin(token, email, yeniSifre) {
  guardAdmin_(token);
  if (String(yeniSifre || '').length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
  var u = kullaniciBul_(email);
  if (!u) throw new Error('Kullanıcı bulunamadı.');
  kullaniciSifreGuncelle_(u.row, yeniSifre);
  return true;
}

/* ── kullanıcının kendi şifresini değiştirmesi ── */
function kullaniciSifreDegistir(token, yeniSifre) {
  var session = guard_(token);
  if (String(yeniSifre || '').length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
  var u = kullaniciBul_(session.email);
  if (!u) throw new Error('Kullanıcı bulunamadı.');
  kullaniciSifreGuncelle_(u.row, yeniSifre);
  return true;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SESSION_TTL_SECONDS: SESSION_TTL_SECONDS,
    LOGIN_LOCK_THRESHOLD: LOGIN_LOCK_THRESHOLD,
    LOGIN_LOCK_WINDOW_SECONDS: LOGIN_LOCK_WINDOW_SECONDS,
    kullaniciSheet_: kullaniciSheet_,
    kullaniciSayisi_: kullaniciSayisi_,
    kullaniciBul_: kullaniciBul_,
    kullaniciEkle_: kullaniciEkle_,
    kullaniciSonGirisGuncelle_: kullaniciSonGirisGuncelle_,
    kullaniciSifreGuncelle_: kullaniciSifreGuncelle_,
    loginKilitliMi_: loginKilitliMi_,
    loginBasarisiz_: loginBasarisiz_,
    loginBasariliSifirla_: loginBasariliSifirla_,
    girisYap: girisYap,
    oturumGetir_: oturumGetir_,
    guard_: guard_,
    guardAdmin_: guardAdmin_,
    mevcutKullaniciGetir: mevcutKullaniciGetir,
    kullaniciListele: kullaniciListele,
    kullaniciEkleApi: kullaniciEkleApi,
    kullaniciDurumDegistir: kullaniciDurumDegistir,
    kullaniciSifreDegistirAdmin: kullaniciSifreDegistirAdmin,
    kullaniciSifreDegistir: kullaniciSifreDegistir
  };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
