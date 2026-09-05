const { installGasMocks } = require('./gasMocks');
const { loadSrc } = require('./loadSrc');

function setup() {
  installGasMocks({ scriptProperties: { KASA_SPREADSHEET_ID: 'test-kasa-id' } });
  loadSrc();
}

beforeEach(() => {
  setup();
});

describe('girisYap', () => {
  test('fails when the user does not exist', () => {
    const r = girisYap('yok@ornek.com', 'sifre1234');
    expect(r.ok).toBe(false);
  });

  test('succeeds with correct credentials and returns a token', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const r = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(true);
    expect(r.token).toBeTruthy();
    expect(r.rol).toBe('yonetici');
  });

  test('fails with a wrong password', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'muhasebe');
    const r = girisYap('kisi@ornek.com', 'yanlisSifre');
    expect(r.ok).toBe(false);
  });

  test('is case-insensitive on email', () => {
    kullaniciEkle_('Karisik@Ornek.com', 'Karışık', 'dogruSifre1', 'muhasebe');
    const r = girisYap('KARISIK@ornek.COM', 'dogruSifre1');
    expect(r.ok).toBe(true);
  });

  test('rejects a deactivated user even with the right password', () => {
    kullaniciEkle_('pasif@ornek.com', 'Pasif', 'dogruSifre1', 'magaza');
    const u = kullaniciBul_('pasif@ornek.com');
    kullaniciSheet_().getRange(u.row, 6).setValue(false);
    const r = girisYap('pasif@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
  });

  test('locks out after too many failed attempts', () => {
    kullaniciEkle_('kilit@ornek.com', 'Kilit', 'dogruSifre1', 'magaza');
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      girisYap('kilit@ornek.com', 'yanlis');
    }
    const r = girisYap('kilit@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
    expect(r.hata).toMatch(/deneme/);
  });
});

describe('rolNormallestir_', () => {
  test('maps legacy roles to the new three-role model', () => {
    expect(rolNormallestir_('admin')).toBe('yonetici');
    expect(rolNormallestir_('personel')).toBe('muhasebe');
  });

  test('passes through valid new roles unchanged', () => {
    expect(rolNormallestir_('yonetici')).toBe('yonetici');
    expect(rolNormallestir_('muhasebe')).toBe('muhasebe');
    expect(rolNormallestir_('magaza')).toBe('magaza');
  });

  test('falls back to the most restrictive role for anything else', () => {
    expect(rolNormallestir_('')).toBe('magaza');
    expect(rolNormallestir_(undefined)).toBe('magaza');
    expect(rolNormallestir_('bilinmeyen')).toBe('magaza');
  });

  test('a user added long ago with the legacy "admin" role still logs in as yonetici', () => {
    kullaniciEkle_('eski@ornek.com', 'Eski Yönetici', 'dogruSifre1', 'admin');
    const r = girisYap('eski@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(true);
    expect(r.rol).toBe('yonetici');
  });
});

describe('guard_ / guardYonetici_ / guardMuhasebe_', () => {
  test('guard_ throws for an invalid token', () => {
    expect(() => guard_('gecersiz-token')).toThrow();
  });

  test('guard_ returns the session for a valid token', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'magaza');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    const session = guard_(token);
    expect(session.email).toBe('kisi@ornek.com');
    expect(session.rol).toBe('magaza');
  });

  test('guardYonetici_ throws for a non-yonetici session', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'muhasebe');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(() => guardYonetici_(token)).toThrow();
  });

  test('guardYonetici_ passes for a yonetici session', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(() => guardYonetici_(token)).not.toThrow();
  });

  test('guardMuhasebe_ throws for a magaza session', () => {
    kullaniciEkle_('magaza@ornek.com', 'Mağaza', 'dogruSifre1', 'magaza');
    const { token } = girisYap('magaza@ornek.com', 'dogruSifre1');
    expect(() => guardMuhasebe_(token)).toThrow();
  });

  test('guardMuhasebe_ passes for muhasebe and yonetici sessions', () => {
    kullaniciEkle_('muhasebe@ornek.com', 'Muhasebe', 'dogruSifre1', 'muhasebe');
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const t1 = girisYap('muhasebe@ornek.com', 'dogruSifre1').token;
    const t2 = girisYap('yonetici@ornek.com', 'dogruSifre1').token;
    expect(() => guardMuhasebe_(t1)).not.toThrow();
    expect(() => guardMuhasebe_(t2)).not.toThrow();
  });
});

describe('kullaniciEkleApi', () => {
  test('rejects a duplicate email', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, {
        email: 'yonetici@ornek.com',
        ad: 'Başka',
        sifre: 'baskaSifre1',
        rol: 'magaza'
      })
    ).toThrow();
  });

  test('rejects a short password', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, { email: 'yeni@ornek.com', ad: 'Yeni', sifre: 'kisa', rol: 'magaza' })
    ).toThrow();
  });

  test('a non-yonetici cannot add a user', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'muhasebe');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, { email: 'yeni@ornek.com', ad: 'Yeni', sifre: 'gecerliSifre1', rol: 'magaza' })
    ).toThrow();
  });

  test('normalizes an invalid rol to the most restrictive one', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    kullaniciEkleApi(token, {
      email: 'yeni@ornek.com',
      ad: 'Yeni',
      sifre: 'gecerliSifre1',
      rol: 'gecersiz-rol'
    });
    const list = kullaniciListele(token);
    expect(list.find((u) => u.email === 'yeni@ornek.com').rol).toBe('magaza');
  });
});

describe('kullaniciDurumDegistir', () => {
  test('a yonetici cannot deactivate their own account', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(() => kullaniciDurumDegistir(token, 'yonetici@ornek.com', false)).toThrow();
  });

  test('a yonetici can deactivate another user', () => {
    kullaniciEkle_('yonetici@ornek.com', 'Yönetici', 'dogruSifre1', 'yonetici');
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'muhasebe');
    const { token } = girisYap('yonetici@ornek.com', 'dogruSifre1');
    expect(kullaniciDurumDegistir(token, 'kisi@ornek.com', false)).toBe(true);
    const r = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
  });
});
