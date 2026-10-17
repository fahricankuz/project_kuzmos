/*
 * Kuzmos — Veri katmanı (Supabase).
 *
 * Arayüz kodu sunucuyu `gcall(fn, args, ok, fail)` ile çağırır; bu dosya
 * aynı isimleri Supabase RPC'lerine bağlar. Dönen JSON'un şekli Apps
 * Script sürümüyle aynı olduğu için ekran kodları değişmedi.
 *
 * Yetki kontrolü burada DEĞİL, veritabanındadır (RLS). Bu dosyadaki hiçbir
 * kontrol güvenlik amaçlı değildir; sadece kullanıcıya anlamlı hata verir.
 */

var SB = null;

function sbIstemci() {
  if (SB) return SB;
  var c = window.KUZMOS_CONFIG || {};
  if (!c.SUPABASE_URL || c.SUPABASE_URL.indexOf('BURAYA') === 0) {
    throw new Error('Supabase bağlantısı ayarlanmamış (js/config.js).');
  }
  SB = window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  return SB;
}

/* Kullanıcı eklerken ana oturumu bozmayan ikinci istemci */
function sbGecici() {
  var c = window.KUZMOS_CONFIG || {};
  return window.supabase.createClient(c.SUPABASE_URL, c.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

/** Postgres hata mesajlarını kullanıcıya gösterilebilir hale getirir. */
function hataCevir(e) {
  var m = (e && (e.message || e.msg)) || 'Bilinmeyen hata';
  if (/row-level security|permission denied/i.test(m)) return 'Bu işlem için yetkiniz yok.';
  if (/işletmeye bağlı değil/i.test(m)) return 'ISLETME_YOK';
  if (/JWT|session|Auth session missing/i.test(m)) return 'Oturum süresi doldu, tekrar giriş yapın.';
  if (/Invalid login credentials/i.test(m)) return 'E-posta veya şifre hatalı.';
  if (/Failed to fetch|NetworkError|network/i.test(m)) return 'Sunucuya ulaşılamadı.';
  if (/duplicate key|unique constraint/i.test(m)) return 'Bu kayıt zaten var.';
  return m;
}

async function rpc(ad, parametreler) {
  var r = await sbIstemci().rpc(ad, parametreler || {});
  if (r.error) throw new Error(hataCevir(r.error));
  return r.data;
}

/* ═══════════ API ═══════════ */
var API = {
  /* ── Oturum ve kayıt ── */
  girisYap: async function (email, sifre) {
    var r = await sbIstemci().auth.signInWithPassword({ email: email, password: sifre });
    if (r.error) return { ok: false, hata: hataCevir(r.error) };
    return { ok: true, token: 'sb', email: (r.data && r.data.user && r.data.user.email) || email };
  },

  /**
   * Yeni işletme kaydı: hesap açılır, ardından işletme kurulur.
   * E-posta onayı açıksa signUp oturum döndürmez; kullanıcıya posta
   * kutusunu kontrol etmesi söylenir.
   */
  kayitOl: async function (bilgi) {
    if (!bilgi || !bilgi.eposta || !bilgi.sifre) throw new Error('E-posta ve şifre gerekli.');
    if (String(bilgi.sifre).length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
    var sb = sbIstemci();
    var r = await sb.auth.signUp({ email: bilgi.eposta, password: bilgi.sifre });
    if (r.error) {
      if (/already registered/i.test(r.error.message || '')) {
        throw new Error('Bu e-posta ile bir hesap var. Giriş yapmayı deneyin.');
      }
      throw new Error(hataCevir(r.error));
    }
    if (!r.data || !r.data.session) {
      return { ok: true, onayBekliyor: true };
    }
    var ozet = await rpc('isletme_olustur', {
      p_isletme_ad: bilgi.isletmeAd,
      p_ad_soyad: bilgi.adSoyad || '',
      p_telefon: bilgi.telefon || '',
      p_sube_ad: '',
      p_sube_kod: bilgi.subeKod || ''
    });
    return { ok: true, onayBekliyor: false, isletme: ozet };
  },

  /** Hesabı olup işletmesi olmayan kullanıcı için kurulum. */
  isletmeOlustur: function (token, ad, adSoyad, subeKod, telefon) {
    return rpc('isletme_olustur', {
      p_isletme_ad: ad,
      p_ad_soyad: adSoyad || '',
      p_telefon: telefon || '',
      p_sube_ad: '',
      p_sube_kod: subeKod || ''
    });
  },

  isletmeGuncelle: function (token, bilgi) {
    return rpc('isletme_guncelle', { p: bilgi });
  },
  abonelikOzeti: function () {
    return rpc('abonelik_ozeti');
  },
  magazaEkle: function (token, ad, kod) {
    return rpc('magaza_ekle', { p_ad: ad, p_kod: kod });
  },
  isletmeVerisiAktar: function () {
    return rpc('isletme_verisi_aktar');
  },

  /**
   * İşletme logosu: dosya 'logolar/<isletme_id>/logo.<uzanti>' yoluna
   * yüklenir (Storage politikası başka işletmenin klasörüne yazmayı
   * engeller), adresi ayarlara yazılır.
   */
  logoYukle: async function (token, dosya) {
    if (!dosya) throw new Error('Dosya seçin.');
    if (dosya.size > 1048576) throw new Error('Logo en fazla 1 MB olabilir.');
    var izinli = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (izinli.indexOf(dosya.type) === -1) throw new Error('PNG, JPG, WEBP veya SVG yükleyin.');

    var ozet = await rpc('abonelik_ozeti');
    var uzanti = (dosya.name.split('.').pop() || 'png').toLowerCase();
    var yol = ozet.id + '/logo.' + uzanti;
    var sb = sbIstemci();
    var y = await sb.storage.from('logolar').upload(yol, dosya, { upsert: true });
    if (y.error) throw new Error(hataCevir(y.error));
    var genel = sb.storage.from('logolar').getPublicUrl(yol);
    var url = (genel && genel.data && genel.data.publicUrl) || '';
    /* Önbellek kırıcı: logo değişince tarayıcı eskisini göstermesin */
    return rpc('logo_kaydet', { p_url: url + '?v=' + Date.now() });
  },

  logoKaldir: function () {
    return rpc('logo_kaydet', { p_url: '' });
  },

  mevcutKullaniciGetir: async function () {
    var s = await sbIstemci().auth.getSession();
    if (!s.data || !s.data.session) throw new Error('Oturum bulunamadı.');
    var v = await rpc('tum_veri');
    return v.kullanici;
  },

  cikis: async function () {
    try {
      await sbIstemci().auth.signOut();
    } catch (e) {
      /* oturum zaten yoksa sorun değil */
    }
    return true;
  },

  /* ── Veri ── */
  tumVeriGetir: function () {
    return rpc('tum_veri');
  },
  hareketleriGetir: function () {
    return rpc('hareketler_listesi');
  },
  kasaOzetGetir: function (token, tip, deger, magazaId) {
    return rpc('kasa_ozeti', {
      p_tip: tip || 'gun',
      p_deger: deger || '',
      p_magaza: magazaId || null
    });
  },
  logListele: function (token, limit) {
    return rpc('log_listele', { p_limit: limit || 200 });
  },

  /* ── Sipariş ── */
  siparisKaydet: async function (token, siparis, personel) {
    var kayit = await rpc('siparis_kaydet', { p: siparis, p_personel: personel || '' });
    return { id: kayit.id, no: kayit.no, kayit: kayit };
  },
  siparisOdemeEkle: async function (token, id, odeme, personel) {
    var kayit = await rpc('siparis_odeme_ekle', { p_id: id, p: odeme, p_personel: personel || '' });
    return { id: kayit.id, no: kayit.no, kayit: kayit };
  },
  siparisDurumGuncelle: async function (token, id, durum, personel) {
    var kayit = await rpc('siparis_durum_guncelle', {
      p_id: id,
      p_durum: durum,
      p_personel: personel || ''
    });
    return {
      id: kayit.id,
      durum: kayit.durum,
      durumTarihi: kayit.durumTarihi,
      teslimTarihi: kayit.teslimTarihi
    };
  },
  siparisSil: async function (token, id, personel) {
    await rpc('siparis_sil', { p_id: id, p_personel: personel || '' });
    return true;
  },
  siparisGeriAl: async function (token, id, personel) {
    await rpc('siparis_geri_al', { p_id: id, p_personel: personel || '' });
    return true;
  },
  siparisKaliciSil: async function (token, id) {
    var ok = await rpc('siparis_kalici_sil', { p_id: id });
    if (!ok) throw new Error('Bu işlem için yetkiniz yok.');
    return true;
  },
  copTemizle: function () {
    return rpc('cop_temizle');
  },

  /* ── Müşteri ── */
  musteriGuncelle: function (token, musteri, personel) {
    return rpc('musteri_guncelle', { p: musteri, p_personel: personel || '' });
  },

  /* ── Mağaza masrafı ── */
  magazaMasrafEkle: async function (token, masraf, personel) {
    var id = await rpc('magaza_masraf_ekle', {
      p_kalem: masraf.kalem,
      p_tutar: masraf.tutar,
      p_tarih: masraf.tarih || null,
      p_hesap: masraf.hesap || null,
      p_aciklama: masraf.aciklama || '',
      p_personel: personel || ''
    });
    return {
      id: id,
      tarih: masraf.tarih,
      kalem: masraf.kalem,
      tutar: Number(masraf.tutar),
      hesap: masraf.hesap || '',
      aciklama: masraf.aciklama || '',
      kaydeden: personel || ''
    };
  },
  magazaMasrafSil: async function (token, id, personel) {
    var ok = await rpc('magaza_masraf_sil', { p_id: id, p_personel: personel || '' });
    if (!ok) throw new Error('Bu kaydı silme yetkiniz yok.');
    return true;
  },

  /* ── Kasa (finans) ── */
  hareketKaydet: function (token, h) {
    return rpc('hareket_kaydet', { p: h });
  },
  hareketSil: async function (token, id) {
    var ok = await rpc('hareket_sil', { p_id: id });
    if (!ok) throw new Error('Bu hareket silinemez (sipariş tahsilatından geliyor).');
    return true;
  },
  hedefKaydet: function (token, ay, hedef, notu) {
    return rpc('hedef_kaydet', { p_ay: ay, p_hedef: hedef, p_notu: notu || '' });
  },
  cariKaydet: function (token, tedarikci, ay, planlanan, notu) {
    return rpc('cari_kaydet', {
      p_tedarikci: tedarikci,
      p_ay: ay,
      p_planlanan: planlanan,
      p_notu: notu || ''
    });
  },
  bankaKaydet: function (token, tarih, satirlar) {
    return rpc('banka_kaydet', { p_tarih: tarih, p_satirlar: satirlar || [] });
  },
  tekrarKaydet: function (token, liste) {
    return rpc('tekrar_kaydet', { p_liste: liste || [] });
  },

  /* ── Ayarlar ── */
  personelKaydet: function (token, liste) {
    return rpc('personel_kaydet', { p_liste: liste || [] });
  },
  urunKategorileriKaydet: function (token, liste) {
    return rpc('urun_kategorileri_kaydet', { p_liste: liste || [] });
  },
  kkKomisyonKaydet: function (token, liste) {
    return rpc('kk_komisyon_kaydet', { p_liste: liste || [] });
  },
  markaEkle: function (token, kategori, marka) {
    return rpc('marka_ekle', { p_kategori: kategori, p_marka: marka });
  },
  markaSil: async function (token, kategori, marka) {
    var ok = await rpc('marka_sil', { p_kategori: kategori, p_marka: marka });
    if (!ok) throw new Error('Marka bulunamadı.');
    return true;
  },
  ayarGuncelle: function (token, anahtar, deger) {
    return rpc('ayar_guncelle', { p_anahtar: anahtar, p_deger: String(deger) });
  },

  /* ── Kullanıcılar ── */
  kullaniciListele: function () {
    return rpc('kullanici_listesi');
  },

  /**
   * Yeni kullanıcı: auth kaydı ikinci istemciyle açılır (ana oturum
   * bozulmasın), ardından profil satırı yazılır. Profil açma yetkisi
   * veritabanında yöneticiyle sınırlıdır.
   */
  kullaniciEkleApi: async function (token, k) {
    if (!k || !k.email || !k.sifre) throw new Error('E-posta ve şifre gerekli.');
    if (String(k.sifre).length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
    var gecici = sbGecici();
    var r = await gecici.auth.signUp({ email: k.email, password: k.sifre });
    if (r.error && !/already registered/i.test(r.error.message || '')) {
      throw new Error(hataCevir(r.error));
    }
    await rpc('profil_olustur', {
      p_eposta: k.email,
      p_ad: k.ad || '',
      p_rol: k.rol || 'magaza',
      p_magaza_kod: k.magazaKod || null
    });
    return true;
  },

  kullaniciDurumDegistir: function (token, email, aktif) {
    return rpc('kullanici_durum_degistir', { p_eposta: email, p_aktif: !!aktif });
  },

  /** Kendi şifresini değiştirir. */
  kullaniciSifreDegistir: async function (token, yeni) {
    if (String(yeni || '').length < 8) throw new Error('Şifre en az 8 karakter olmalı.');
    var r = await sbIstemci().auth.updateUser({ password: yeni });
    if (r.error) throw new Error(hataCevir(r.error));
    return true;
  },

  /**
   * Başka bir kullanıcının şifresi sunucu tarafında değiştirilemez (bunun
   * için gizli service_role anahtarı gerekir ve o anahtar tarayıcıya
   * konmaz). Yerine sıfırlama bağlantısı gönderilir.
   */
  kullaniciSifreSifirlamaGonder: async function (token, email) {
    var r = await sbIstemci().auth.resetPasswordForEmail(email);
    if (r.error) throw new Error(hataCevir(r.error));
    return true;
  }
};

/**
 * Arayüzün sunucu çağrısı köprüsü. Apps Script'teki google.script.run ile
 * aynı imza: gcall(fonksiyon, argümanlar, basarili, hatali)
 */
function gcall(fn, args, ok, fail) {
  var f = API[fn];
  if (!f) {
    if (fail) fail(new Error('Bilinmeyen çağrı: ' + fn));
    return;
  }
  var sonuc;
  try {
    sonuc = f.apply(null, args || []);
  } catch (e) {
    if (fail) fail(new Error(hataCevir(e)));
    return;
  }
  Promise.resolve(sonuc).then(
    function (x) {
      if (ok) ok(x);
    },
    function (e) {
      console.error(fn, e);
      if (fail) fail(new Error(hataCevir(e)));
    }
  );
}
