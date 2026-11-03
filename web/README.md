# Kuzmos ERP önizlemesi · v0.7

Açmak için: `hostinger-preview/index.html` (bağımsız sayfa) veya `web/previews/kuzmos-panels.html` (gömülebilir parça).
Personel sipariş föyü `reference/sales/Index.html` olarak korunur; önizleme ona yalnızca dar bir barkod köprüsü ekler.

## Yapı
```
web/finance/engine.mjs   Finans motoru: belge → borç → ödeme → nakit; dengeli çift taraflı fişler
web/inventory/*.mjs      Varyant, barkod, Excel stok aktarımı
web/app/helpers.mjs      Arayüz yardımcıları (rol, takvim, TL ayrıştırma, CSV)
web/app/app.js           Arayüz (Yönetici, Finans, Personel, Envanter)
web/app/shell.html       Stil + iskelet
web/app/build.mjs        Modülleri tek HTML'e paketler → previews/ ve hostinger-preview/
web/tests/*.test.mjs     node --test
```
Önizlemedeki kod elle kopyalanmaz; `node web/app/build.mjs` test edilen modüllerden üretir. CI `--check` ile güncelliği doğrular.

## Finans (gider) tarafı — nasıl çalışır
Her ekrandaki rakam aynı fişlerden türetilir. Üç soru ayrı cevaplanır ve birbirine eklenmez:
1. **Kime ne ödendi** (ödeme raporu: kart, çek, senet dahil)
2. **Kasadan / bankadan ne çıktı** (nakit raporu, nakit akışı; virman hariç)
3. **Gider ne** (kâr/zarar; belgeye göre, ödemeden bağımsız)

Özet ve Raporlar ekranı ikisi arasındaki farkı kalem kalem gösterir (köprü): ödemeler − kartla ödenen − çek/senetle verilen + ekstre ödemeleri + vadesi gelen çek/senet = nakit çıkışı.

Belge türleri: mal alışı (stoğa girer, gider değil), hizmet/gider faturası (KDV, KDV tevkifatı, stopaj ayrı borçlar), kira, serbest meslek, demirbaş (yatırım), bordro (net maaş / SGK / muhtasar ayrı), vergi-SGK tahakkuku (kesintilerle eşleşir, fazlası incelemeye), KDV beyanı (hesaplanan − indirilecek − devreden), kredi taksiti (anapara gider değil), kart ekstresi, şahsi/aile (ortak carisi, gider değil), belgesi beklenen plan (fiş yok), faturasız avans (sonra mahsup).

Ödeme: havale/EFT, nakit, şirket kartı (kart borcu doğar), çek (keşide bankasından vadede tam tutar), senet. Kısmi ödeme, aynı firmanın birden çok kalemi, avans, çek iadesi (borç yeniden açılır), ters kayıtla geri alma, dönem kilidi, ekstre mutabakatı, tekrarlayan ödemeler, 30 günlük nakit projeksiyonu, CSV dışa aktarma.

Seiko örneği demo verisinde hazırdır: 50.000 TL devreden borç 10 Kasım'da kartla ödendi, 24 Kasım'da 54.000 TL ekstre bankadan ödendi, 4.000 TL fark **İnceleme** ekranında bekliyor (otomatik gider yazılmadı); faiz / masraf / önceki borç / şahsi harcama olarak sınıflandırılır. Çalışma günü 25 Kasım 2026.

## Doğrulama
`node --test web/tests/*.test.mjs hostinger-preview/server.test.mjs` ve `node web/app/build.mjs --check`.

## Prototip sınırı
Veri yalnızca sayfa oturumunda yaşar. Kimlik doğrulama, canlı veritabanı, banka bağlantısı yoktur; rol seçimi güvenlik değildir. Vergi oranları örnektir; hesap kodları TDHP önerisidir, muhasebeci onayı gerekir. Satılan malın maliyeti stok modülü bağlanınca eklenecek. Üretimde aynı kurallar sunucu tarafında (Supabase RLS, transaction, idempotency, audit) zorunlu kılınmalıdır.
