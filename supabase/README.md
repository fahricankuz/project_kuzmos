# Kuzmos · Veri katmanı (Supabase / Postgres)

Kuzmos aylık abonelikle satılan bir üründür: **tek bir Supabase projesi**,
içinde birbirinden yalıtılmış **abone işletmeler**. (Mimarinin teknik adı
çok kiracılı / multi-tenant; "kiracı" dediğimiz şey abone optik
işletmesidir.)

```
isletmeler (abone optik işletmesi)
  ├── magazalar (şubeler)
  │     └── siparisler → siparis_urunleri, odemeler
  ├── musteriler, personel, hesaplar, kategoriler, markalar, ayarlar
  ├── hareketler (kasa), hedefler, cari_plan, banka_dogrulama, tekrarlayan
  └── log
planlar · abonelik_hareketleri · platform_yoneticileri   (Kuzmos ekibi)
```

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `migrations/0001_sema.sql` | Tablolar, tipler, indeksler; platform + kiracı katmanı |
| `migrations/0002_mantik.sql` | Sipariş no, toplamlar, teslim tarihi, sipariş→kasa senkronu, kasa özeti, işletme damgası |
| `migrations/0003_guvenlik.sql` | RLS: işletme yalıtımı + rol + abonelik kapısı |
| `migrations/0004_api.sql` | Uygulama uçları: `tum_veri()`, `siparis_kaydet()`, `abonelik_ozeti()` … |
| `migrations/0005_kullanicilar.sql` | Kullanıcı/şube yönetimi, plan limitleri, veri aktarımı |
| `migrations/0006_onboarding.sql` | `isletme_olustur()` (kayıt), varsayılanlar, platform uçları |
| `migrations/0007_logo.sql` | İşletme logosu (Storage kovası ve yetkileri) |
| `seed.sql` | Yalnızca satış paketleri (`planlar`) |

Hepsi `test/db/*.test.js` ile gerçek Postgres üzerinde test edilir
(`npm run test:db` — 190 test). Test ortamı PGlite kullanır, Supabase'e
bağlanmaz.

## Güvenlik — nasıl çalışıyor

Üç bağımsız katman:

1. **İşletme yalıtımı.** İşletmeye ait her tabloda `isletme_id` var ve her
   RLS politikası önce `isletme_id = aktif_isletme()` kontrolünü yapar.
   `isletme_id` istemciden GELMEZ: `isletme_damgala()` trigger'ı onu üst
   kayıttan (şube/kategori/hesap) veya oturumdan damgalar. İstemci başka bir
   işletmenin id'sini göndererek veri sızdıramaz.
2. **Rol.** `yonetici` (kullanıcı, şube, ayar, abonelik) · `finans` (kasa,
   rapor, cari, banka) · `magaza_muduru` (kendi şubesi + şube kasası özeti)
   · `personel` (kendi şubesi: sipariş, tahsilat, müşteri, masraf; kasa
   özetini görmez). İşletmeyi kuran kullanıcı `kurucu` işaretlidir: rolü
   düşürülemez, hesabı pasife alınamaz.
3. **Abonelik kapısı.** Süresi dolan işletme **salt okunur** olur:
   verisini görür ve indirir, yeni kayıt giremez (`yazma_izni()`). Veriyi
   rehin almak yok — KVKK taşınabilirlik hakkı da bunu gerektirir.

Ayrıca:

- **Abonelik alanları kiracıya kapalı.** `isletmeler` tablosunda kiracı için
  UPDATE politikası yoktur; plan/durum/bitiş tarihi yalnızca platform
  yöneticisi veya ödeme webhook'u ile (`abonelik_guncelle()`) değişir.
  Kurumsal bilgiler `isletme_guncelle()` ile değişir.
- **Platform yöneticisi** (Kuzmos ekibi) abonelik ve kullanım sayılarını
  görür; kiracıların iş verisine (sipariş, müşteri, kasa, log) **erişemez**.
  `test/db/izolasyon.test.js` bunu da sınar.
- **Otomatik kasa hareketleri** (`kaynak='SIPARIS'`) hiçbir rol tarafından
  elle değiştirilemez/silinemez; kaynak ödeme silinirse FK cascade ile
  düşer.

`test/db/izolasyon.test.js` 15 tabloyu tek tek dolaşıp iki ayrı işletmenin
birbirini görmediğini doğrular; bir politika eksik kalırsa test kırılır.
Logo dosyaları da aynı sınıra tabidir: her işletme yalnızca kendi
klasörüne (`logolar/<isletme_id>/`) yazabilir.

## Sipariş numarası ve logo

Sipariş numarası ürün biçimindedir: **KUZ-10-26-0001** (ön ek · ay · yıl ·
sıra). Ön ek şube kodudur ve yeni işletmede `KUZ` olarak açılır; sipariş
formunda işletmeyi **logosu** temsil eder (Ayarlar → Logo). Çok şubeli
işletmeler ikinci şubeye farklı bir kod verir — her şubenin kendi sayacı
vardır.

## Kurulum

### 1. Supabase projesi
1. [supabase.com](https://supabase.com) → **New project**, bölge
   **Frankfurt (eu-central-1)**, veritabanı şifresini kaydet.
2. **SQL Editor** → aşağıdaki dosyaların içeriğini **sırayla** yapıştır + Run:
   `0001_sema` → `0002_mantik` → `0003_guvenlik` → `0004_api` →
   `0005_kullanicilar` → `0006_onboarding` → `0007_logo` → `seed.sql`

### 2. Kayıt akışını aç
**Authentication → Providers → Email**: "Enable email provider" açık olsun.
- **Confirm email** açıksa kullanıcı önce postasını onaylar (önerilir).
- Kapalıysa kayıt tek adımda tamamlanır (demo/hızlı deneme için pratik).

**Authentication → URL Configuration → Site URL**: uygulamanın adresi
(örn. `https://app.kuzmos.com`). Şifre sıfırlama bağlantıları buraya döner.

Artık her optik işletmesi uygulamanın **Kayıt** ekranından kendi hesabını
açıp 14 günlük denemeyi başlatabilir. Elle SQL girmeye gerek yoktur.

### 3. Kendini platform yöneticisi yap
Kendi hesabınla kaydolduktan sonra (veya Authentication'dan kullanıcı
açtıktan sonra) **SQL Editor**'de:

```sql
insert into platform_yoneticileri (id, ad)
select id, 'Fahri Can Kuz' from auth.users where email = 'sen@ornek.com'
on conflict (id) do nothing;
```

Platform uçları:

```sql
select platform_ozet();                       -- abone sayıları, denemesi bitenler
select abonelik_guncelle(
  '<isletme_id>', 'pro', 'aktif', '2027-10-01', 1490, 'elle', 'EFT-2026-001');
select abonelikleri_denetle();                -- süresi geçenleri askıya al
```

### 4. Planları düzenle
Fiyat ve limitler `planlar` tablosunda; koda gömülü değildir:

```sql
update planlar set aylik_fiyat = 990, yillik_fiyat = 9900 where kod = 'temel';
```

`seed.sql`'deki fiyatlar örnektir — kendi fiyatlandırmanı gir.

### 5. Günlük bakım (önerilir)
Supabase **Database → Extensions** → `pg_cron` aç, sonra:

```sql
select cron.schedule('abonelik-denetim', '0 3 * * *', 'select abonelikleri_denetle()');
select cron.schedule('cop-temizle', '30 3 * * *', 'select cop_temizle()');
```

### 6. Yedek
**Database → Backups** günlük yedek alır. Ayrıca her abone kendi verisini
uygulamadan (Ayarlar → "Tüm verimi indir") JSON olarak indirebilir.

## Ürün tarafında eksik kalanlar

Kod tarafı hazır; bunlar **senin ticari kararına** bağlı ve ayrıca kurulmalı:

- **Ödeme alma.** `abonelik_guncelle()` ödeme sağlayıcısının çağıracağı uç
  olarak hazır. Türkiye için iyzico/PayTR (TL, taksit) ya da Paddle/Stripe
  (yurt dışı, KDV'yi onlar yönetir) bir Edge Function + webhook ile
  bağlanır. Şu an **elle tahsilat** (havale/EFT) ile çalışır: parayı alınca
  `abonelik_guncelle(...)` çağırırsın.
- **E-posta.** Supabase'in varsayılan SMTP'si düşük limitlidir; kendi SMTP
  sağlayıcını (Resend, Postmark, SendGrid) **Project Settings → Auth → SMTP**
  altında tanımla, yoksa onay/sıfırlama postaları gitmez.
- **KVKK.** Reçete verisi **özel nitelikli kişisel veri** (sağlık) sayılır.
  Sen veri işleyen, abone optikçi veri sorumlusu olur: aboneyle bir
  **veri işleme sözleşmesi** imzalanmalı, VERBİS kaydı ve aydınlatma
  metinleri abonenin yükümlülüğü, saklama/silme süreleri tanımlanmalı.
  Teknik taraf hazır: veri aktarımı (`isletme_verisi_aktar`), işletme silme
  (`delete from isletmeler ... cascade`), erişim günlüğü (`log`).
- **Platform paneli.** `platform_ozet()` verisi hazır; ayrı bir yönetim
  ekranı henüz yok (şimdilik SQL Editor).
- **Logo kovası** `0007_logo.sql` ile açılır; Storage → `logolar` kovasının
  oluştuğunu Supabase panelinden doğrulayabilirsin.
