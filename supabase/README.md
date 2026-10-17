# Kuzmos · Supabase (Postgres) katmanı

Bu dizin, Sheets yerine gerçek bir veritabanı kullanan yeni veri katmanıdır.
**Mevcut Apps Script uygulamasına dokunmaz**; ikisi bir süre yan yana
çalışabilir, geçiş bitince eskisi kapatılır.

## Dosyalar

| Dosya | Ne yapar |
|---|---|
| `migrations/0001_sema.sql` | Tablolar, tipler, indeksler, kısıtlar |
| `migrations/0002_mantik.sql` | Sipariş no, toplamlar, teslim tarihi, sipariş→kasa senkronu, kasa özeti, günlük |
| `migrations/0003_guvenlik.sql` | RLS politikaları ve fonksiyon yetkileri |
| `migrations/0004_api.sql` | Uygulama uçları: `tum_veri()`, `siparis_kaydet()`, `kasa_ozeti()`, ... |
| `migrations/0005_kullanicilar.sql` | Kullanıcı/profil yönetimi ve küçük uçlar |
| `seed.sql` | Ayarlar, kategoriler, markalar, personel, kasa kategori ağacı |

Hepsi `test/db/*.test.js` ile gerçek Postgres üzerinde test edilir
(`npm run test:db` — 114 test; 98'i veritabanı mantığı/güvenliği, 16'sı
arayüzden veritabanına uçtan uca). Test ortamı PGlite kullanır, Supabase'e
bağlanmaz.

## Sheets'ten farkı (neden daha sağlam)

- **Ödemeler ayrı satır.** JSON içinde gömülü değil; "Eylül'ün nakit
  tahsilatı" tek SQL sorgusu. Sayfanın tamamını okuyup JS'te taramak yok.
- **Sipariş ↔ kasa bağı veritabanı garantisi.** Tahsilat girilince kasa
  hareketi trigger ile oluşur, ödeme değişirse güncellenir, ödeme silinirse
  foreign key cascade ile silinir. Elle senkron kodu (ve "kasa tutmuyor"
  ihtimali) ortadan kalkar.
- **Sipariş numarası atomik.** Sayaç tablosu + tek `on conflict do update`:
  iki kişi aynı anda kaydetse de aynı numara üretilemez.
- **Yetki veritabanında.** Arayüzü atlayıp doğrudan sorgu atan biri de RLS'e
  takılır. Mağaza rolü kasanın tamamını göremez; otomatik hareketleri
  muhasebe bile elle değiştiremez.
- **Tutarlar `numeric(12,2)`** — kayan nokta yuvarlama hatası yok.
- **Çok şubeli.** Her kayıt bir mağazaya ait; ikinci şube bir satır eklemekle
  açılır, kod değişikliği gerekmez.

## Kurulum (adım adım)

### 1. Supabase projesi aç
1. [supabase.com](https://supabase.com) → **Start your project** → GitHub ile giriş.
2. **New project**: ad `kuzmos`, bölge **Frankfurt (eu-central-1)** (Türkiye'ye
   en yakın), veritabanı şifresini **bir yere kaydet**.
3. Proje hazır olana kadar ~2 dakika bekle.

### 2. Şemayı kur
**SQL Editor** → **New query**. Şu dosyaların içeriğini **sırayla** yapıştır
ve her birinde **Run**:
1. `migrations/0001_sema.sql`
2. `migrations/0002_mantik.sql`
3. `migrations/0003_guvenlik.sql`
4. `migrations/0004_api.sql`
5. `migrations/0005_kullanicilar.sql`
6. `seed.sql`

Her biri "Success. No rows returned" demeli. Hata verirse sonraki dosyaya
geçme.

### 3. Kullanıcıları aç
**Authentication → Users → Add user → Create new user**:

| E-posta | Rol | Not |
|---|---|---|
| `can@damlakuzoptik.com` | yonetici | Senin hesabın |
| `damlakuzoptik@gmail.com` | magaza | Mağaza tableti (ortak hesap) |
| (muhasebe e-postası) | muhasebe | İsteğe bağlı |

**Auto Confirm User** kutusunu işaretle (e-posta doğrulaması beklemesin).

Sonra **SQL Editor**'de rolleri ata:

```sql
-- Yönetici
insert into profiller (id, ad, rol, eposta)
select id, 'Fahri Can Kuz', 'yonetici', email
from auth.users where email = 'can@damlakuzoptik.com'
on conflict (id) do update
  set rol = 'yonetici', ad = excluded.ad, eposta = excluded.eposta, aktif = true;

-- Mağaza (şubeye bağlı)
insert into profiller (id, magaza_id, ad, rol, eposta)
select u.id, m.id, 'Atrium Mağaza', 'magaza', u.email
from auth.users u, magazalar m
where u.email = 'damlakuzoptik@gmail.com' and m.kod = 'DK'
on conflict (id) do update
  set rol = 'magaza', magaza_id = excluded.magaza_id, eposta = excluded.eposta, aktif = true;
```

Bundan sonraki kullanıcıları uygulamanın **Ayarlar** ekranından
ekleyebilirsin (yönetici hesabıyla); SQL'e dönmen gerekmez.

### 4. Oturum ayarları
**Authentication → Providers → Email**: "Confirm email" kapalı olsun (mağaza
ortak hesapla girecek). **Authentication → Sessions**: oturum süresini uzun
tut (tablet her gün yeniden giriş yapmasın).

### 5. Bağlantı bilgilerini al
**Project Settings → API**:
- **Project URL** (`https://xxxx.supabase.co`)
- **anon public** anahtarı

Bu ikisi arayüze gömülür ve **gizli değildir** — veriyi koruyan şey RLS'tir,
anahtarın saklanması değil. Buna karşılık **`service_role` anahtarı asla**
arayüze konmaz, bu depoya yazılmaz, kimseyle paylaşılmaz: o anahtar RLS'i
baypas eder.

### 6. Yedek
**Database → Backups**: ücretsiz katmanda günlük yedek vardır. Ayrıca
**Database → Backups → Download** ile elle yedek alabilirsin. Haftada bir
indirmek iyi bir alışkanlık.

## Veriyi elle düzeltmek

**Table Editor** Sheets'e benzer bir tablo arayüzü verir: satır ekleyip
düzeltebilirsin. Fark şu: artık bir sütunu kaydırmak veya formülü bozmak
mümkün değil; kısıtlar ve trigger'lar yanlış veriyi reddeder.

## Geliştirici notları

- Yerel testler: `npm run test:db` (PGlite, Supabase'e bağlanmaz).
- Yeni bir migrasyon eklerken `migrations/` içine artan numarayla yeni dosya
  aç; var olan dosyaları değiştirme (Supabase'de çalıştırılmış olurlar).
- `siparis_sayaclari` tablosuna ve iç yardımcı fonksiyonlara uygulamadan
  erişim yoktur; sadece trigger'lar kullanır.
