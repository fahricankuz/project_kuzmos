/**
 * Supabase şemasını gerçek Postgres'te (PGlite, WASM) çalıştıran test
 * ortamı. Supabase'in sağladığı parçaları taklit eder:
 *   · auth.users tablosu
 *   · auth.uid() — oturumdaki kullanıcı
 *   · anon / authenticated rolleri
 *
 * oturumAc(uid) ile rol değiştirip RLS politikalarını gerçekten test ederiz;
 * yonetici() superuser'a döner (RLS baypas) — kurulum/doğrulama için.
 */
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');

const MIGRASYON_DIZINI = path.join(__dirname, '..', '..', 'supabase', 'migrations');
const SEED = path.join(__dirname, '..', '..', 'supabase', 'seed.sql');

/* Supabase'in auth şemasının test karşılığı */
const AUTH_SHIM = `
  create schema if not exists auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text unique not null
  );
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
  create or replace function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('app.jwt', true), '')::jsonb, '{}'::jsonb) $$;
  /* Supabase Storage'ın test karşılığı: kova + nesne tabloları ve
     klasör yardımcısı. Gerçek projede bunlar hazır gelir. */
  create schema if not exists storage;
  create table storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text not null references storage.buckets,
    name text not null,
    owner uuid,
    olusturma timestamptz not null default now()
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as
    $$ select string_to_array(regexp_replace(name, '/[^/]*$', ''), '/') $$;

  create role anon;
  create role authenticated;
  grant usage on schema auth, storage to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  grant select on storage.buckets to anon, authenticated;
  grant select on auth.users to authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant execute on function auth.jwt() to anon, authenticated;
`;

const SEED_SQL = fs.readFileSync(SEED, 'utf8');

async function veritabaniKur(opts) {
  opts = opts || {};
  const db = new PGlite();
  await db.exec(AUTH_SHIM);

  const dosyalar = fs
    .readdirSync(MIGRASYON_DIZINI)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const f of dosyalar) {
    const sql = fs.readFileSync(path.join(MIGRASYON_DIZINI, f), 'utf8');
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error('Migrasyon hatası (' + f + '): ' + e.message);
    }
  }
  if (opts.seed !== false) {
    await db.exec(SEED_SQL);
  }
  return new TestDb(db);
}

class TestDb {
  constructor(db) {
    this.db = db;
    this.uid = null;
  }

  /** Superuser (RLS baypas) — kurulum ve doğrulama için. */
  async sistem() {
    await this.db.exec("reset role; set app.uid = '';");
    this.uid = null;
  }

  /** Verilen kullanıcı olarak 'authenticated' rolünde çalış (RLS aktif). */
  async oturumAc(uid) {
    await this.db.exec('reset role;');
    const u = await this.tek('select email from auth.users where id = $1', [uid]);
    await this.db.query('select set_config($1, $2, false)', ['app.uid', uid]);
    await this.db.query('select set_config($1, $2, false)', [
      'app.jwt',
      JSON.stringify({ sub: uid, email: (u && u.email) || '' })
    ]);
    await this.db.exec('set role authenticated;');
    this.uid = uid;
  }

  async sor(sql, params) {
    const r = await this.db.query(sql, params);
    return r.rows;
  }

  async tek(sql, params) {
    const rows = await this.sor(sql, params);
    return rows[0] || null;
  }

  async calistir(sql, params) {
    return this.db.query(sql, params);
  }

  /**
   * Tüm veriyi siler ve başlangıç verisini yeniden yükler.
   * PGlite örneği pahalı (~2 sn) olduğu için testler aynı veritabanını
   * paylaşır, her test öncesi bununla sıfırlanır. Mağaza/kategori id'leri
   * değiştiği için profiller yeniden atanmalıdır (profilAta).
   */
  async sifirla() {
    await this.sistem();
    await this.db.exec(`
      truncate auth.users cascade;
      truncate planlar cascade;
      truncate log restart identity cascade;
    `);
    await this.db.exec(SEED_SQL);
  }

  /**
   * Kayıt akışıyla yeni bir kiracı kurar: hesap açar, isletme_olustur()
   * çağırır (sahip olur), sonra muhasebe ve mağaza kullanıcılarını ekler.
   * Gerçek ürün akışının aynısı — testler kurulumu elle taklit etmez.
   */
  async kiraciKur(opts) {
    opts = opts || {};
    const onEk = opts.onEk || 'k1';
    const ad = opts.ad || 'Örnek Optik';
    const subeKod = opts.subeKod || 'KUZ';

    const sahip = await this.kullaniciOlustur(onEk + '-yonetici@ornek.com');
    await this.oturumAc(sahip);
    const ozet = (
      await this.tek('select isletme_olustur($1, $2, $3, $4, $5) as o', [
        ad,
        opts.sahipAd || 'İşletme Sahibi',
        opts.telefon || '',
        opts.subeAd || '',
        subeKod
      ])
    ).o;

    const isletme = ozet.id;
    const magaza = (
      await this.tek('select id from magazalar where isletme_id = $1 order by olusturma limit 1', [isletme])
    ).id;

    const etiket = { finans: 'Finans', magaza_muduru: 'Mağaza Müdürü', personel: 'Personel' };
    const subeRolu = { magaza_muduru: true, personel: true };
    /* Kurucu kullanıcı 'yonetici' rolündedir (isletme_olustur böyle kurar) */
    const kullanicilar = { yonetici: sahip };
    for (const r of opts.roller || ['finans', 'magaza_muduru', 'personel']) {
      const uid = await this.kullaniciOlustur(onEk + '-' + r + '@ornek.com');
      await this.sistem();
      await this.calistir(
        `insert into profiller (id, isletme_id, magaza_id, ad, rol, eposta)
         values ($1, $2, $3, $4, $5, $6)`,
        [uid, isletme, subeRolu[r] ? magaza : null, etiket[r] || r, r, onEk + '-' + r + '@ornek.com']
      );
      kullanicilar[r] = uid;
    }
    await this.oturumAc(sahip);
    return { isletme: isletme, magaza: magaza, ozet: ozet, uid: kullanicilar };
  }

  /** Kuzmos ekibi (platform yöneticisi) hesabı. */
  async platformYoneticisiEkle(eposta) {
    const uid = await this.kullaniciOlustur(eposta || 'platform@kuzmos.app');
    await this.sistem();
    await this.calistir('insert into platform_yoneticileri (id, ad) values ($1, $2)', [uid, 'Platform']);
    return uid;
  }

  /** Aboneliği doğrudan değiştirir (ödeme sağlayıcısının yaptığı iş). */
  async abonelikAyarla(isletme, alanlar) {
    const onceki = this.uid;
    await this.sistem();
    await this.calistir(
      `update isletmeler set
         plan_kod = coalesce($2, plan_kod),
         durum = coalesce($3, durum::text)::abonelik_durumu,
         deneme_bitis = coalesce($4, deneme_bitis),
         abonelik_bitis = coalesce($5, abonelik_bitis)
       where id = $1`,
      [
        isletme,
        alanlar.plan || null,
        alanlar.durum || null,
        alanlar.denemeBitis || null,
        alanlar.abonelikBitis || null
      ]
    );
    if (onceki) await this.oturumAc(onceki);
  }

  /** auth.users kaydı (Supabase'de kayıt olmanın karşılığı). */
  async kullaniciOlustur(email) {
    const onceki = this.uid;
    await this.sistem();
    const u = await this.tek('insert into auth.users (email) values ($1) returning id', [email]);
    if (onceki) await this.oturumAc(onceki);
    return u.id;
  }

  /** Profil atar/günceller (rol ve şube). */
  async profilAta(uid, ad, rol, magazaId) {
    const onceki = this.uid;
    await this.sistem();
    await this.calistir(
      `insert into profiller (id, magaza_id, ad, rol) values ($1, $2, $3, $4)
       on conflict (id) do update set magaza_id = excluded.magaza_id,
         ad = excluded.ad, rol = excluded.rol, aktif = true`,
      [uid, magazaId || null, ad, rol]
    );
    if (onceki) await this.oturumAc(onceki);
    return uid;
  }

  /** Kullanıcı + profil (tek adımda). */
  async kullaniciEkle(email, ad, rol, magazaId) {
    const uid = await this.kullaniciOlustur(email);
    return this.profilAta(uid, ad, rol, magazaId);
  }

  async magazaId(kod) {
    const m = await this.tek('select id from magazalar where kod = $1', [kod || 'DK']);
    return m && m.id;
  }

  /** Oturumsuz (anon) istek. */
  async anonimOl() {
    await this.db.exec("reset role; set app.uid = ''; set app.jwt = ''; set role anon;");
    this.uid = null;
  }

  async kapat() {
    await this.db.close();
  }
}

/** Beklenen hatayı yakalar; mesajı döner (yoksa test başarısız olsun diye null). */
async function hataBekle(fn) {
  try {
    await fn();
  } catch (e) {
    return e.message || String(e);
  }
  return null;
}

module.exports = { veritabaniKur, hataBekle };
