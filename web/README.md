# Kuzmos ERP önizlemesi · v0.8

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

## v0.8: stok → finans, şubeler, satış, kasa, bütçe
- **Şubeler / masraf merkezi:** Atrium mağaza, E-ticaret (online satışlar, sosyal medya ve ajans giderleri; stok Atrium deposundan düşer), Merkez (ortak giderler). Belgelere ve satışlara şube atanır; Raporlar › Şubeler şube kâr/zararını gösterir. Yapı işletmeye göre tanımlanır (tek şube zorunlu değil).
- **Stok defteri:** SKU bazında ağırlıklı ortalama maliyet, şube bazında miktar. Alış faturası stok satırlarıyla stoğa girer; faturası sonra gelen mal kabul (329) ve sayım farkı desteklenir. Muhasebe stoğu (153) ile stok defteri kapanış kontrolünde karşılaştırılır.
- **Sipariş föyü → finans:** Föyde kaydet, `saveRecordToServer` üzerinden finansa iletilir (föy değişmedi). Kapora avanstır (340); “Teslim Edildi” olunca hasılat (600), kategori KDV’si (391) ve SKU bağlı satırlar için satılan malın maliyeti (621). Aynı kayıt tekrar gelirse çift tahsilat oluşmaz. Temsilciye göre şube (ör. “Fahri Can”, “İnternet” → E-ticaret).
- **İade / iptal:** Satış iadesi (610 + KDV düzeltmesi), stoğa teslim maliyetiyle geri giriş, nakit/POS/banka iadesi; teslim edilmemiş siparişte kapora iadesi.
- **POS:** Banka ve taksit bazında komisyon oranı ve valör tanımlanır. Varsayılan: komisyon ertesi gün ekstreden elle (oran yalnızca tahmin). Otomatik mod açılan POS’ta valörü gelenler tanımlı oranla bankaya aktarılır.
- **Mağaza kasası:** Satış personeli kasadan küçük masraf girer (fiş/foto eki), muhasebe onaylar / yeniden sınıflar. Gün sonu sayımı: bankaya yatan virman, açık incelemeye, fazla 649’a.
- **Taksitli alış:** Fatura borcu eşit taksitlere bölünür; her taksit ayrı ödeme kalemidir.
- **Bütçe:** Ay ve şube bazında plan / fiili / sapma; önceki aydan kopyalama.
- **Belge eki:** Fatura, fiş, dekont (PDF/görsel, 10 MB). Önizlemede yalnızca tarayıcı belleğinde tutulur; canlıda özel depolama gerekir.

## Müşteri bildirimleri (otomatik e-posta)
Föydeki üç mail şablonu korunur: **Satış Yapıldı** → “Siparişiniz için teşekkürler”, **Montaj Yapıldı** → “Gözlüğünüz teslimata hazır”, **Teslim Edildi** → “Teşekkürler + kullanım önerileri”. Föy her kayıtta şablonları Kuzmos’a iletir; gönderim kararını `web/notify/notify.mjs` verir:
- Her sipariş × mail türü bir kez (tekrar kaydetmek, durumu geri alıp ilerletmek ikinci mail göndermez). Elle “Mail İlet / Tekrar gönder” ayrı kayıt açar.
- Ara aşama atlanırsa yalnızca güncel durumun maili gider; “Cam Siparişi Verildi”de mail yok.
- E-postası olmayan / hatalı sipariş görünür kalır; föyde e-posta eklenip kaydedilince aynı mail gider.
- Müşteri bazında “mail istemiyor”; yönetici mail türlerini açıp kapatabilir; başlangıç tarihi öncesi siparişlere geriye dönük mail atılmaz.
- Gönderim hatası en fazla 3 kez tekrar denenir.
Önizlemede gerçek e-posta gönderilmez. Canlıda gönderim sunucu tarafında, işletmenin alan adından (SPF/DKIM/DMARC tanımlı SMTP) yapılır; mevcut Apps Script föyünde `musteriyeMailGonder` aynı şekilde çalışmaya devam eder. Mailler sipariş bilgilendirmesidir; içerikte kampanya/tanıtım olursa ticari ileti onayı (İYS) gerekir.
