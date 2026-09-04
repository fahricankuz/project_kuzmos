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
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    const r = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(true);
    expect(r.token).toBeTruthy();
    expect(r.rol).toBe('admin');
  });

  test('fails with a wrong password', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const r = girisYap('kisi@ornek.com', 'yanlisSifre');
    expect(r.ok).toBe(false);
  });

  test('is case-insensitive on email', () => {
    kullaniciEkle_('Karisik@Ornek.com', 'Karışık', 'dogruSifre1', 'personel');
    const r = girisYap('KARISIK@ornek.COM', 'dogruSifre1');
    expect(r.ok).toBe(true);
  });

  test('rejects a deactivated user even with the right password', () => {
    kullaniciEkle_('pasif@ornek.com', 'Pasif', 'dogruSifre1', 'personel');
    const u = kullaniciBul_('pasif@ornek.com');
    kullaniciSheet_().getRange(u.row, 6).setValue(false);
    const r = girisYap('pasif@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
  });

  test('locks out after too many failed attempts', () => {
    kullaniciEkle_('kilit@ornek.com', 'Kilit', 'dogruSifre1', 'personel');
    for (let i = 0; i < LOGIN_LOCK_THRESHOLD; i++) {
      girisYap('kilit@ornek.com', 'yanlis');
    }
    const r = girisYap('kilit@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
    expect(r.hata).toMatch(/deneme/);
  });
});

describe('guard_ / guardAdmin_', () => {
  test('guard_ throws for an invalid token', () => {
    expect(() => guard_('gecersiz-token')).toThrow();
  });

  test('guard_ returns the session for a valid token', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    const session = guard_(token);
    expect(session.email).toBe('kisi@ornek.com');
    expect(session.rol).toBe('personel');
  });

  test('guardAdmin_ throws for a non-admin session', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(() => guardAdmin_(token)).toThrow();
  });

  test('guardAdmin_ passes for an admin session', () => {
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    const { token } = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(() => guardAdmin_(token)).not.toThrow();
  });
});

describe('kullaniciEkleApi', () => {
  test('rejects a duplicate email', () => {
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    const { token } = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, { email: 'admin@ornek.com', ad: 'Başka', sifre: 'baskaSifre1', rol: 'personel' })
    ).toThrow();
  });

  test('rejects a short password', () => {
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    const { token } = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, { email: 'yeni@ornek.com', ad: 'Yeni', sifre: 'kisa', rol: 'personel' })
    ).toThrow();
  });

  test('a non-admin cannot add a user', () => {
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const { token } = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(() =>
      kullaniciEkleApi(token, { email: 'yeni@ornek.com', ad: 'Yeni', sifre: 'gecerliSifre1', rol: 'personel' })
    ).toThrow();
  });
});

describe('kullaniciDurumDegistir', () => {
  test('an admin cannot deactivate their own account', () => {
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    const { token } = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(() => kullaniciDurumDegistir(token, 'admin@ornek.com', false)).toThrow();
  });

  test('an admin can deactivate another user', () => {
    kullaniciEkle_('admin@ornek.com', 'Yönetici', 'dogruSifre1', 'admin');
    kullaniciEkle_('kisi@ornek.com', 'Kişi', 'dogruSifre1', 'personel');
    const { token } = girisYap('admin@ornek.com', 'dogruSifre1');
    expect(kullaniciDurumDegistir(token, 'kisi@ornek.com', false)).toBe(true);
    const r = girisYap('kisi@ornek.com', 'dogruSifre1');
    expect(r.ok).toBe(false);
  });
});
