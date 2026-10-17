# Kuzmos · Web arayüzü

Apps Script'ten çıkarılmış, doğrudan Supabase'e bağlanan statik arayüz.
Sunucu kodu yok: tarayıcı Postgres'e RPC çağırır, yetkiyi RLS tutar.

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
