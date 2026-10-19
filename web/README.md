# Kuzmos · Web arayüzü

Optik işletmelerine aylık abonelikle satılan uygulamanın arayüzü. Statik
dosyalar: sunucu kodu yok, tarayıcı doğrudan Postgres'e RPC çağırır, yetkiyi
ve işletme yalıtımını RLS tutar.

**Tek kurulum, çok abone.** Aynı adrese kaydolan her optik işletmesi kendi
yalıtılmış verisiyle çalışır; ayrı kurulum/deploy gerekmez.

## Demo (sunucusuz önizleme)

```bash
node tools/demo-olustur.js        # kuzmos-demo.html üretir
```

Gerçek arayüz + örnek veri, tek dosyada. Alt bandındaki rol değiştirici ile
Yönetici / Finans / Mağaza Müdürü / Personel görünümleri, palet değiştirici ile
de marka renkleri karşılaştırılır. Yazma işlemleri bellekte kalır, sayfa
yenilenince başa döner.

| Dosya | Ne |
|---|---|
| `index.html` | Tüm ekranlar ve modallar (tek sayfa) |
| `app.css` | Renk sistemi (token), tasarım + A4 yazdırma stilleri |
| `js/config.js` | Supabase URL + anon anahtar (**doldurulacak**) |
| `js/api.js` | Veri katmanı: `gcall(...)` → Supabase RPC |
| `js/core.js` | Durum, giriş, navigasyon, KDV/komisyon/prim hesapları |
| `js/siparis.js` | Sipariş formu, kayıtlar, müşteriler, pipeline, yazdırma |
| `js/panel.js` | Mağaza paneli, masraf, hedef, ayarlar |
| `js/kasa.js` | Kasa özeti, rapor, hareketler, planlanan, banka, yıllık |

Ekran kodları Apps Script sürümüyle neredeyse aynıdır: sunucu çağrısı köprüsü
(`gcall`) aynı imzayı koruduğu için ekranlar değişmeden taşındı.

## Renk sistemi / marka kimliği

Hiçbir bileşen doğrudan renk kullanmaz; hepsi `app.css` başındaki anlamsal
token'lardan gelir. Paleti değiştirmek = tek bir blokta değer düzenlemek.

| Token ailesi | Nerede |
|---|---|
| `--vurgu`, `--vurgu-koyu`, `--vurgu-silik`, `--vurgu-ust`, `--vurgu-metin`, `--vurgu-rgb` | Marka rengi: düğme, aktif sekme, seçili çip, ilerleme çubuğu, grafik. `--vurgu-metin` yalnızca `--vurgu-silik` zemini üstündeki yazı içindir |
| `--zemin`, `--yuzey`, `--yuzey-2`, `--cizgi`, `--metin*` | Yüzeyler ve tipografi |
| `--ust-*`, `--baslik-*` | Üst bar ve kart başlıkları |
| `--basarili`, `--tehlike`, `--uyari`, `--bilgi` (+ `-silik` / `-cizgi`) | Durum renkleri — paletten bağımsız |
| `--koyu-zemin`, `--koyu-metin`, `--koyu-vurgu` | Giriş ekranı, gün sonu kasa kutusu, onay animasyonu |

Hazır paletler (`:root[data-tema="..."]`). Hepsinin ortak zemini aynı nötr
grafit yüzeydir; palet yalnızca vurgu rengini değiştirir.

| Tema | Vurgu | Karakter |
|---|---|---|
| *(öntanımlı)* **Lens** | `#6B2BE8` | Grafit yüzey + tek canlı renk. Mor; bankaların mavisinden ve rakiplerin yeşilinden ayrışır, üstelik durum renklerinin (yeşil/kırmızı/amber) hiçbiriyle karışmaz |
| `grafit` | `#1C1C1F` | Saf tek renk; vurgu da nötr, renk yalnızca paranın yönünde |
| `kasa` | `#0B8A52` | Zümrüt; "kasa/nakit" vurgusu |
| `mevcut` | `#F5C800` | Eski siyah + sarı görünüm (geri dönüş için) |

Paleti değiştirmek: `document.documentElement.setAttribute('data-tema','berrak')`.
Öntanımlıya dönmek için özniteliği kaldırmak yeterli. Grafik renkleri de
`tokenRenk()` ile aynı token'lardan okunur, ayrıca elden geçirmek gerekmez.

## Abone akışı

1. **Kayıt** (`viewKayit`) — işletme adı, ad soyad, e-posta, şifre.
   `auth.signUp` + `isletme_olustur()`: işletme, ilk şube, sahip profili ve
   o işletmeye ait varsayılan listeler (kategori, marka, kasa ağacı, ayarlar)
   tek adımda kurulur, 14 günlük deneme başlar.
2. **Kullanım** — sahip Ayarlar'dan kullanıcı ve şube ekler (plan
   limitlerine kadar), satış personelini tanımlar; mağaza hesabı tabletten
   sipariş girer.
3. **Abonelik bandı** — ekranın altında deneme süresi ve kalan gün görünür.
   Süre dolunca uygulama **salt okunur** olur: veri durur, yeni kayıt
   girilemez, "Tüm verimi indir" çalışmaya devam eder.

## Roller

| | personel | magaza_muduru | finans | yonetici |
|---|---|---|---|---|
| Sipariş, tahsilat, müşteri, masraf | ✅ | ✅ | ✅ | ✅ |
| Gün/ay kasa özeti, panel, hedef görünümü | ❌ | ✅ | ✅ | ✅ |
| Kasa hareketleri, rapor, cari, banka, yıllık | ❌ | ❌ | ✅ | ✅ |
| Kullanıcı, şube, işletme bilgisi, logo, abonelik | ❌ | ❌ | ❌ | ✅ |

Şube rolleri (`personel`, `magaza_muduru`) yalnızca kendi şubesini görür.
Ortak tablet `personel` hesabıyla açılır; işlemi yapan satış personeli her
kayıtta listeden seçilir (listede yoksa adı yazılır, listeye eklenir).

Hiçbir işletme adı, personel adı veya mesaj şablonu koda gömülü değildir;
hepsi işletme ayarıdır (Ayarlar → İşletme / Logo / Müşteri mesajı ve ERP).
Sipariş numarası ürün biçimindedir (KUZ-10-26-0001); sipariş formunda
işletmeyi yüklediği logo temsil eder.

## 1. Bağlantı bilgilerini yaz

`js/config.js` içindeki iki değeri Supabase **Project Settings → API**
ekranından doldur:

```js
window.KUZMOS_CONFIG = {
  SUPABASE_URL: 'https://xxxxxxxx.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOi...'
};
```

Bu ikisi gizli değildir, tarayıcıya gömülmek üzere tasarlanmıştır; veriyi
koruyan şey RLS'tir. **`service_role` anahtarı buraya yazılmaz.**

## 2. Yayına alma (Cloudflare Pages — ücretsiz)

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** →
   **Create** → **Pages** → **Connect to Git**.
2. Bu depoyu seç.
3. Ayarlar:
   - **Framework preset**: None
   - **Build command**: (boş bırak)
   - **Build output directory**: `web`
4. **Save and Deploy**. Birkaç saniyede `https://<ad>.pages.dev` adresi hazır.
5. Kendi alan adın için: **Custom domains** → `kasa.damlakuzoptik.com`.

Her `git push` sonrası otomatik yayınlanır. Vercel veya Netlify de aynı
şekilde çalışır (output dizini `web`).

### Tablet için
Adresi Chrome'da aç → **Ana ekrana ekle**. Tam ekran açılır, oturum
tarayıcıda saklanır; her gün yeniden giriş gerekmez.

## 3. Yerel deneme

```bash
cd web && python3 -m http.server 8080
```

`http://localhost:8080` — `config.js` dolu olmalı. Supabase'de
**Authentication → URL Configuration → Site URL / Redirect URLs** listesine
yerel adresi eklemen gerekebilir (şifre sıfırlama bağlantısı için).

## Çevrimdışı davranış

Sunucuya ulaşılamazsa sipariş ve kasa kayıtları `localStorage` kuyruğuna
alınır, üstte "senkron bekleyen kayıt" bandı görünür; bağlantı gelince
kuyruk gönderilir. Kuyruktaki kayıt gönderilene kadar veritabanında
**yoktur** — kasa bu yüzden kuyruk boşken sayılmalıdır.
