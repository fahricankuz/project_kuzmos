# Kuzmos · Web arayüzü

Optik işletmelerine satılan çok kiracılı uygulamanın arayüzü. Statik
dosyalar: sunucu kodu yok, tarayıcı doğrudan Postgres'e RPC çağırır,
yetkiyi ve kiracı izolasyonunu RLS tutar.

**Tek kurulum, çok abone.** Aynı adrese kaydolan her optik işletmesi kendi
yalıtılmış verisiyle çalışır; ayrı kurulum/deploy gerekmez.

| Dosya | Ne |
|---|---|
| `index.html` | Tüm ekranlar ve modallar (tek sayfa) |
| `app.css` | Tasarım + A4 yazdırma stilleri |
| `js/config.js` | Supabase URL + anon anahtar (**doldurulacak**) |
| `js/api.js` | Veri katmanı: `gcall(...)` → Supabase RPC |
| `js/core.js` | Durum, giriş, navigasyon, KDV/komisyon/prim hesapları |
| `js/siparis.js` | Sipariş formu, kayıtlar, müşteriler, pipeline, yazdırma |
| `js/panel.js` | Mağaza paneli, masraf, hedef, ayarlar |
| `js/kasa.js` | Kasa özeti, rapor, hareketler, planlanan, banka, yıllık |

Ekran kodları Apps Script sürümüyle neredeyse aynıdır: sunucu çağrısı köprüsü
(`gcall`) aynı imzayı koruduğu için ekranlar değişmeden taşındı.

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

Hiçbir işletme adı, personel adı veya mesaj şablonu koda gömülü değildir;
hepsi işletme ayarıdır (Ayarlar → İşletme / Müşteri mesajı ve ERP).

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
