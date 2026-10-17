# Kuzmos

**Optik işletmeleri için sipariş ve kasa yönetimi.** Mağaza siparişi girer ve
tahsilatı işler; tahsilat aynı anda kasaya gelir olarak düşer; muhasebe ve
yönetici aynı veriden rapor alır. Mağaza kasanın tamamını göremez.

Ürün çok kiracılı bir SaaS olarak çalışır: her optik işletmesi kaydolur,
14 gün dener, kendi yalıtılmış verisiyle devam eder (bkz. *Ürün: çok
kiracılı SaaS*).

## Roller

| Yetki | magaza | muhasebe | yonetici | sahip |
| --- | --- | --- | --- | --- |
| Sipariş oluştur / düzenle / tahsilat / iade | ✅ | ✅ | ✅ | ✅ |
| Müşteriler, pipeline, mağaza paneli | ✅ | ✅ | ✅ | ✅ |
| Mağaza masrafı girme | ✅ | ✅ | ✅ | ✅ |
| Günün/ayın kasası özeti | ✅ | ✅ | ✅ | ✅ |
| Kasa hareketleri, rapor, cari, banka, yıllık | ❌ | ✅ | ✅ | ✅ |
| Personel / marka / hedef / oran ayarları | ❌ | ✅ | ✅ | ✅ |
| Kullanıcı ve şube yönetimi, işletme bilgileri | ❌ | ❌ | ✅ | ✅ |
| Siparişi kalıcı silme | ❌ | ✅ | ✅ | ✅ |
| Abonelik (plan görüntüleme, veri indirme) | ❌ | ❌ | ✅ | ✅ |

`sahip` işletmeyi kuran kullanıcıdır; elle atanamaz, pasife alınamaz.
Apps Script sürümünde `sahip` yoktur (`admin`/`personel` → `yonetici`/`muhasebe`).

Eski sürümdeki `admin` / `personel` rolleri girişte otomatik olarak `yonetici`
ve `muhasebe`ye eşlenir (`rolNormallestir_`).

**Satış personeli ≠ kullanıcı hesabı.** Mağazada herkes aynı tableti ve aynı
"Mağaza" hesabını kullandığı için satışı kimin yaptığı ve bir kaydı kimin
değiştirdiği `Personel` sayfasındaki listeden seçilir; her işlem `Log`
sayfasına o kişinin adıyla yazılır.

## Sipariş modülü

- Sipariş no sunucuda kilitle üretilir (`DK-AA-YY-0001`) — aynı anda kaydeden
  iki kişi çakışmaz.
- Ürün satırı: **Marka** (kategori → marka iki aşamalı seçici, "Diğer" ile elle
  giriş), ürün/model, adet, ekartman, köprü, kol, birim fiyat. Elle yazılan
  marka listeye otomatik eklenir.
- Ara toplam otomatik; genel toplam elle düşürülürse indirim tutarı ve yüzdesi
  hesaplanır, KDV dağıtımı bu indirime göre yapılır.
- **Çoklu tahsilat**: sınırsız kapora/tahsilat, her biri kendi tarihi ve
  yöntemiyle (nakit / kredi kartı + banka + taksit). İade negatif tahsilattır.
- Reçete (uzak/yakın × sağ/sol: sph, cyl, ax, pdm, yükseklik, not) sipariş ve
  müşteri kartında saklanır.
- Teslim tarihi elle girilmez: durum "Teslim Edildi" yapıldığında o gün, tamamı
  tahsil edildiğinde son ödeme tarihi olarak yazılır.
- A4 tek sayfa yazdırma, pipeline (sürükle-bırak, gecikme rozetleri), çöp
  kutusu (3 gün sonra sunucu tarafında temizlenir), CSV dışa aktarma.

## Kasa entegrasyonu

`siparis_kasa_entegrasyon` ayarı açıkken her tahsilat otomatik bir kasa
hareketine dönüşür:

| Tahsilat | Kasa hareketi |
| --- | --- |
| Nakit | GELİR · "Nakit Satış" · nakit hesabı |
| Kredi kartı | GELİR · "POS / Kredi Kartı Satışı" · "&lt;Banka&gt; POS" hesabı |
| İade | GİDER · "Satış İadesi" |

Hareketin tarihi ödemenin kendi tarihidir (nakit esaslı), sipariş tarihi değil.
Ödeme silinir/değişirse hareket de güncellenir; sipariş çöpe atılırsa
hareketleri kalkar, geri alınırsa döner. Bu hareketler listede "⚙️ otomatik"
işaretiyle görünür ve elle düzenlenemez.

## Mağaza paneli ve kasa özeti

- Aylık **hedef**: gerçekleşen, yüzde, kalan güne göre gereken günlük tempo.
- Ciro / kasaya giren (KDV, komisyon+prim, net) / bekleyen alacak kartları.
- Günlük tahsilat grafiği; personel, kategori, marka ve yıllık performans
  tabloları (kasa, KDV, komisyon, net, net ortalama, indirim).
- Başlıktaki **Bugün (Kasa)** / **Bu Ay (Kasa)** kutularına tıklayınca:
  nakit satış · POS satış · toplam → personel kırılımı → masraflar →
  **net nakit** (nakit satış − nakit masraf) ve devirli nakit kasa bakiyesi.

## Proje yapısı

```
src/
  appsscript.json    — Apps Script manifest (webapp erişimi, saat dilimi)

  Config.js          — Sayfa adları, Script Properties tabanlı yapılandırma
  Utils.js           — Saf yardımcılar (cln_, dstr_, num_)
  Crypto.js          — Şifre hash'leme (salt + iteratif HMAC-SHA256)
  SheetService.js    — Spreadsheet/sayfa erişimi
  Auth.js            — Kullanıcılar, oturum, roller, guard fonksiyonları
  Log.js             — Değişiklik günlüğü (hesap + satış personeli)
  Ayarlar.js         — Anahtar/değer ayarları, oran ve liste çözümleme
  Kategori.js        — Kasa kategorileri, ürün kategorileri, markalar
  Personel.js        — Satış personeli listesi
  Musteri.js         — Müşteri kartları (reçete dahil)
  Hareketler.js      — Kasa gelir/gider hareketleri (+ kaynak takibi)
  Cari.js            — Tedarikçi bazlı planlanan ödemeler
  Banka.js           — Haftalık banka bakiye doğrulaması
  Tekrar.js          — Tekrarlayan ödemeler
  KasaSenkron.js     — Sipariş tahsilatı → kasa hareketi senkronu
  Siparis.js         — Sipariş CRUD, çoklu tahsilat, durum, çöp
  Masraf.js          — Mağaza masrafı + günlük/aylık kasa özeti
  Hedef.js           — Aylık mağaza hedefleri
  Rapor.js           — Aylık raporun Sheets'e yazılması
  Setup.js           — ilkKurulum() ve guncellemeKurulum()
  Main.js            — doGet(), include(), tumVeriGetir()

  Index.html         — Sayfa iskeleti (tüm ekranlar ve modallar)
  Css.html           — Stiller (ekran + A4 yazdırma)
  JsCore.html        — Durum, giriş, navigasyon, seçiciler, hesaplama motoru
  JsSiparis.html     — Sipariş formu, kayıtlar, müşteriler, pipeline, çöp
  JsPanel.html       — Mağaza paneli, kasa özeti, masraf, hedef, ayarlar
  JsKasa.html        — Kasa özeti, rapor, hareketler, cari, banka, yıllık

supabase/            — Ürün veri katmanı (Postgres); bkz. supabase/README.md
  migrations/        — Şema, mantık, RLS, API, kullanıcılar, kayıt (onboarding)
  seed.sql           — Satış paketleri (planlar)

web/                 — YENİ arayüz (statik, Supabase'e bağlanır)
  index.html         — Tüm ekranlar
  app.css            — Stiller (ekran + A4 yazdırma)
  js/config.js       — Supabase URL + anon anahtar
  js/api.js          — gcall(...) → Supabase RPC köprüsü
  js/core.js         — src/JsCore.html'in dosya hali (diğerleri de aynı)

test/
  gasMocks.js        — Apps Script global'lerinin Jest sahteleri
  loadSrc.js         — src/*.js dosyalarını ortak global scope'a yükler
  *.test.js          — Apps Script testleri (86 test)
  db/harness.js      — PGlite (WASM Postgres) + Supabase auth taklidi
  db/sbTaklit.js     — supabase-js istemcisinin test taklidi
  db/*.test.js       — Mantık, güvenlik, API, kiracı izolasyonu, abonelik
                       ve uçtan uca arayüz testleri (180)
```

Arayüz `HtmlService.createTemplateFromFile` ile birleştirilir; `Index.html`
içindeki `<?!= include('Css') ?>` çağrıları diğer HTML dosyalarını gömer.

## Ürün: çok kiracılı SaaS

Kuzmos tek bir işletmenin iç aracı değil, **optik işletmelerine satılan bir
ürün**. Tek kurulum (bir Supabase projesi + bir statik site) birçok aboneye
hizmet eder:

| | Çalışan sürüm (Apps Script) | Ürün sürümü (Supabase) |
|---|---|---|
| Kod | `src/` | `web/` + `supabase/` |
| Veri | Google Sheets | Postgres |
| Kapsam | Tek işletme | Çok kiracı (`isletmeler`) |
| Yetki | `guard_*` fonksiyonları | RLS: kiracı + rol + abonelik |
| Roller | yonetici / muhasebe / magaza | sahip / yonetici / muhasebe / magaza |
| Kayıt | Elle kurulum | Kendi kendine kayıt + 14 gün deneme |
| Sipariş→kasa | `KasaSenkron.js` (elle) | Veritabanı trigger'ı |
| Test | `npm run test:gas` (86) | `npm run test:db` (180) |

Kiracı izolasyonu, rol yetkileri ve abonelik kapısı veritabanındadır;
arayüz atlanarak doğrudan sorgu atıldığında da geçerlidir. Ayrıntı:
`supabase/README.md`. Abone akışı ve yayına alma: `web/README.md`.

`src/` (Apps Script) ilk müşterinin çalışan kurulumudur; ürün sürümüne
geçene kadar dokunulmadan durur.

## Sheets sayfaları

| Sayfa | İçerik |
| --- | --- |
| `Siparisler` | Siparişler (ürünler, reçete, ödemeler JSON olarak) |
| `Musteriler` | Müşteri kartları ve son reçete |
| `Personel` | Satış personeli listesi (prim muafiyeti dahil) |
| `Markalar` | Kategori → marka eşleşmeleri |
| `Urun_Kategorileri` | Ürün kategorileri ve KDV oranları |
| `Kategoriler` | Kasa gelir/gider kategori ağacı |
| `Hareketler` | Kasa hareketleri (+ Kaynak / Kaynak ID) |
| `Cari_Plan`, `Banka_Dogrulama`, `Tekrarlayan` | Kasa modülü |
| `Kullanicilar` | Giriş hesapları (hash'li şifre) |
| `Hedefler` | Aylık mağaza hedefleri |
| `Ayarlar` | Oranlar, listeler, açılış kasası |
| `Log` | Kim ne zaman ne değiştirdi |

## Geliştirme

```bash
npm install
npm test          # Jest
npm run lint      # ESLint
npm run format    # Prettier (src/**/*.js, test/**/*.js)
```

## Kurulum

1. Yeni bir Google E-Tablo oluşturun; adres çubuğundaki `/d/` ile `/edit`
   arasındaki kimliği not alın.
2. Tabloda **Uzantılar → Apps Script**'i açın.
3. `src/` altındaki 21 `.js` dosyasını aynı adlarla (uzantısız) birer
   **Komut Dosyası**, 6 `.html` dosyasını birer **HTML** dosyası olarak
   ekleyip içeriklerini yapıştırın.
4. Proje Ayarları'ndan `appsscript.json` görünürlüğünü açıp içeriğini
   `src/appsscript.json` ile değiştirin.
5. Editörde bir kez çalıştırın:

   ```js
   function _ilkKurulumCalistir() {
     ilkKurulum('SPREADSHEET_ID', 'yonetici@sirket.com', 'Ad Soyad', 'gecici-sifre');
   }
   ```

   Bu, tüm sayfaları oluşturur, varsayılan kategori/marka/personel/oran
   listelerini doldurur ve ilk `yonetici` kullanıcısını ekler.
6. **Dağıt → Yeni dağıtım → Web uygulaması**: Çalıştıran = *Ben*,
   Erişim = *Bağlantıya sahip herkes*.

Kod güncellendiğinde: dosyaları yapıştırın ve bir kez `guncellemeKurulum()`
çalıştırın — eksik sayfa ve ayarları tamamlar, mevcut veriye dokunmaz.
Dağıtımda **mevcut dağıtımı düzenleyin**; yeni dağıtım oluşturmak yeni bir
bağlantı üretir.

Alternatif olarak [clasp](https://github.com/google/clasp) ile
`npm run clasp:push` kullanılabilir (`.clasp.json.example` → `.clasp.json`).

## Ayarlar (Sheets · `Ayarlar` sayfası)

| Anahtar | Örnek |
| --- | --- |
| `hesaplar` | `Nakit Kasa, Garanti POS` |
| `nakit_hesap` | `Nakit Kasa` |
| `bankalar` | `Akbank, QNB, Garanti, ...` |
| `taksitler` | `Tek çekim, 2 Taksit, ...` |
| `kk_komisyon` | `Tek çekim:3.5, 3 Taksit:9, Diğer:14.49` |
| `personel_prim` | `4.5` |
| `magaza_masraf_kalemleri` | `Temizlik / Sarf, Kargo, ...` |
| `siparis_kasa_entegrasyon` | `evet` / `hayır` |
| `siparis_no_onek` | `DK` |
| `acilis_kasa`, `acilis_tarih`, `acilis_borc`, `borc_hesaplari` | kasa devri |

Kategori, marka, personel ve hedef listeleri uygulamanın **Ayarlar** ekranından
da düzenlenebilir.

## Güvenlik notları

- Şifreler kullanıcıya özel salt ile binlerce kez zincirlenmiş HMAC-SHA256 ile
  saklanır (`src/Crypto.js`). Apps Script'te bcrypt/Argon2 yerleşik değildir;
  daha yüksek güvenlik için kimlik doğrulama gerçek bir backend'e taşınmalıdır.
- Oturumlar `CacheService`'te 6 saat geçerli token'lardır; 15 dakikada 5
  başarısız girişten sonra hesap geçici kilitlenir.
- Rol kontrolü sunucudadır: arayüzde gizlenen ekranlara doğrudan çağrı ile de
  erişilemez (`guardMuhasebe_`, `guardYonetici_`).
- **ESLint `no-undef: off`** — Apps Script'te tüm dosyalar tek global scope
  paylaşır; gerçek "tanımsız fonksiyon" hataları test suite'i ile yakalanır.

## Hız (Sheets çağrı bütçesi)

Apps Script'te darboğaz hesaplama değil, Sheets'e atılan çağrı sayısıdır:
her `getDataRange()` / `appendRow()` / `openById()` ayrı bir ağ turudur
(~100-300 ms). Bu yüzden kod "aynı sayfayı bir işlemde iki kez okumaz"
kuralıyla yazılmıştır:

- `sheet_()` ve `ss_()` çağrı ömürlü önbellek kullanır (`src/SheetService.js`).
  GAS'ta global'ler her istekte sıfırlandığından önbellek kendiliğinden istek
  kapsamındadır; testler `onbellekSifirla_()` ile boşaltır.
- `ayarOku_()` önbelleklidir, her yazma önbelleği boşaltır.
- Sipariş listesi bir kez okunur; sipariş numarası üretimi ve kasa senkronu
  bu listeyi parametre olarak alır.
- Toplu yardımcılar: `satirlariEkle_`, `markalariSagla_`,
  `kasaKategorileriSagla_`, `hesaplariSagla_` — ürün/ödeme başına değil
  işlem başına bir okuma + bir yazma.
- Yazma uçları (`siparisKaydet`, `siparisOdemeEkle`, `hareketKaydet`,
  `magazaMasrafEkle`) güncel kaydı döner; istemci `DATA`'yı yerinde yamalar,
  `tumVeriGetir`'i yeniden çağırmaz (`siparisYamala` vb., `src/JsCore.html`).
- Arayüz tembel çizer: bir ekran ancak görünürken ve verisi değiştiyse
  yeniden çizilir (`EKRAN_CIZ`, `ekranlariKirlet`). Yıllık özet veri sürümü
  bazında önbelleğe alınır, günlük grafik yıkılmak yerine güncellenir.
- `test/performans.test.js` çağrı sayısını sabitler: sahte Sheets katmanı
  okuma/yazma/açılış sayar, testler üst sınırları doğrular. Yeni bir sayfa
  okuması eklenirse test kırmızıya döner.
- Ölçüm için Apps Script editöründen `hizTesti()` çalıştırılabilir; aşama
  başına milisaniye değerlerini "Yürütme günlüğü"ne yazar.

## Bilinen sınırlamalar

- Eski sipariş/kasa sistemlerinden veri taşınmadı; sistem sıfırdan başlar.
  Yıl sonu veri göçü ayrı planlanacaktır.
- `tumVeriGetir` tüm siparişleri istemciye gönderir; kayıt sayısı çok
  büyüdüğünde sunucu tarafı sayfalama gerekecektir. Panel ve yıllık özet
  12 aylık nakit akışını istemcide hesapladığı için sayfalama bu ekranların
  birlikte ele alınmasını gerektirir.
- Başlangıçtaki kategori ve marka listeleri örnektir; gerçek kullanımda
  Ayarlar'dan düzenlenmelidir.
