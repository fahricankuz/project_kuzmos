# Kuzmos — ürün kapsamı ve ilk faz kabul ölçütleri
Kuz Management Operating System. Damla Kuz Optik ilk pilot işletmedir; ürün tek işletmeye özel kodlanmayacaktır.

## Bu değişiklikteki durum
Bu dal bir ürün tasarımı / önizleme dalıdır; çalışan SaaS veya tamamlanmış muhasebe servisi değildir.
- Yönetici, personel, muhasebe ve envanter önizlemeleri.
- Gönderilen özgün satış Index içeriğinin referans kopyası. Form yeniden tasarlanmamıştır.
- Kartlı tedarikçi ödemesi / banka ekstre ödemesi için küçük çift taraflı kayıt prototipi ve testleri.
- Canlı Supabase, personel yetkilendirmesi, envanter API'si veya banka bağlantısı kurulmamıştır.
- Mevcut src/ Apps Script uygulaması değiştirilmez ve bu dal canlı dağıtım yapmaz.
- Önizleme rol düğmeleri gerçek erişim kontrolü değildir.
- Orijinal dosyadaki doğrudan tarayıcı kayıtları ve Google Apps Script bağlantısı yalnızca referanstır; canlı ürüne aynı veri erişimiyle taşınmayacaktır.

## Satış ve CRM: korunacak sözleşme
1. Sipariş bilgileri: no, tarih, teslim tarihi, temsilci.
2. Müşteri: isim, telefon, e-posta, TC/VKN; geçmiş kayıt üzerinden müşteri bulma.
3. Uzak/yakın reçete: sağ/sol SPH, CYL, AX, PDM, yükseklik ve notlar; mevcut seçim pencereleri.
4. Ürün satırları: model, adet, ekartman, köprü, kol, kategori, birim fiyat. Çoklu ürün.
5. Ara toplam, indirim, genel toplam, tahsil edilen ve kalan.
6. Çoklu kapora/tahsilat; ödeme yöntemi, kart/POS, taksit ve tarih.
7. Nebim'e işlendi işareti; bu alan otomatik API entegrasyonu olduğu anlamına gelmez.
8. Müşteriler, kayıtlar, pipeline, teslim bildirimi ve A4 yazdırma.
9. Mevcut masaüstü/mobil düzen ve işlem sırası.
10. Kaynakta bulunan hatalar (ör. tekrarlanan DOM kimlikleri, kalıcı silme, sessiz kaydetme hataları) görünümü bozmadan düzeltilir.
11. Marka, personel listesi, kategori ve oranlar işletmeye bağlı ayarlardır.
12. Envanterde barkod eşleştirmesi ürün satırına ek bir giriş kısayolu olarak bağlanır; formun yerine başka bir satış ekranı getirilmez.
Kabul: kaynakla alan/akış eşleştirme tablosu, ekran karşılaştırması ve personel kullanım testi.

## Nakit raporu ve kayıt motoru
Kullanıcı basit ödeme ekranı görür. Arkada çift taraflı ve dengeli fişler, kaynak belge ilişkileri, ödeme eşleştirmeleri ve alt defterler bulunur.
Üç ayrı soru cevaplanır:
- Kime / ne için ne kadar ödeme yapıldı?
- Hangi nakit / banka hesabından gerçekten para çıktı?
- İşlemin gelir/gider, stok, yatırım veya finansman etkisi nedir?
Bu raporlar aynı işlem kimlikleri üzerinden üretilir; alt toplamlar birbirine eklenmez.

### Seiko / şirket kartı / banka örneği
Varsayım: önceki alıştan Seiko borcu 50.000 TL, banka açılışı 100.000 TL, kart açılışı sıfırdır. Önceki alışın vergi detayı örneğe dahil değildir.
- 10 Kasım: Borç Seiko satıcı hesabı 50.000 / Alacak Garanti şirket kartı 50.000. Seiko'ya ödeme 50.000, kart borcu 50.000, nakit çıkışı sıfır.
- 24 Kasım: gerçek banka çıkışı 54.000 ise Borç kart 50.000 + Borç inceleme/mahsup hesabı 4.000 / Alacak banka 54.000. Banka bakiyesi 46.000; kart borcu sıfır. Açıklanmayan 4.000 otomatik gider değildir.
- Farkın faiz/masraf olduğu belgeyle doğrulanırsa ilgili gider hesabına sınıflandırılır. Bu yeni nakit çıkışı değildir.
- Fark önceki ekstre borcu, başka alış, avans veya hata ise ilgili kayda eşleştirilir. Yalnızca fark var diye faiz yaratılmaz.
- Banka hareketi biliniyorsa nakit çıkışı gerçek tarihte tam tutarıyla kaydedilir. Fark inceleme listesinde kalır, dönem kapanışı kontrolüne girer.
- Tedarikçi ödeme raporu 50.000; banka çıkış raporu 54.000 gösterir. Toplam nakit çıkışı 104.000 olmaz.
- Aynı ekstre banka entegrasyonundan tekrar gelirse ikinci ödeme yaratılmaz.
- Kredi kartına fazla ödeme olursa borç alt defterinde avans/alacak olarak ayrıca desteklenir; gereksiz faiz gideri yaratılmaz.

### İşlem türleri
Tedarikçi faturası, nakit/havale ödeme, kartla ödeme, kart ekstre borcu kapatma, kredi anapara, faiz/masraf, POS tahsilatı, POS bankaya geçişi, hesap transferi, ortak sermaye/çekişi, yatırım, vergi, iade ve avans ayrı işlem türleridir.
- Kasadan bankaya transfer şirket toplam nakdini veya gelir/giderini değiştirmez.
- Kredi anapara ödemesi tekrar giderleşmez.
- Mal alımı/stoğa giriş doğrudan her durumda dönem gideri sayılmaz. Satılan malın maliyeti satışın ilgili dönemine bağlanır.
- POS tahsilatı müşteri borcunu kapatır; banka valörü ve komisyon ayrı kayıttır.
- Müşteri avansı tahsilattır; sipariş açılması tek başına tüm hasılatın oluştuğu anlamına gelmez.
- İade, satış iptali, kart iadesi ve stok geri girişi kaynak işleme bağlı ters kayıtlarla yapılır.
- Vergi oranları belge satırında anlık değer olarak saklanır; geçmiş veri güncel oranla yeniden yazılmaz.
- Her rapor tarih kesimindeki kayıtları kullanır; gelecekteki ödemeler geçmiş borcu değiştirmez.

## Rapor sınıflandırması
Tek bir operasyonel/faaliyet dışı bayrağı yeterli değildir:
1. Gelir tablosu: satış, satış maliyeti, işletme gideri, finansman gideri, diğer.
2. Nakit akışı: işletme / yatırım / finansman, ayrıca iç transfer ve nakit dışı.
3. Yönetim analizi: işletme, şube, tedarikçi, kategori, kanal, ürün.
Resmî nakit akışı eşlemesi, yükümlülüğün niteliği ve işletmenin tabi olduğu raporlama esasına göre muhasebeciyle doğrulanır. Yönetim amaçlı ödeme raporu resmî IAS/TMS tablosu olarak etiketlenmez.
Resmî hesap planı, VUK/TDHP ve varsa ilgili TFRS/BOBİ FRS/KÜMİ FRS kapsamı işletmenin muhasebecisiyle netleştirilmelidir. Bu önizleme uyum sertifikası veya resmî defter değildir.
Kaynaklar:
- https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/
- https://www.ifrs.org/issued-standards/list-of-standards/ias-2-inventories/

## Envanter ve barkod: ilk faz
- Ürün / marka / model / renk / ekartman / köprü / kol / kategori varyantları.
- Üretici barkodu ve iç SKU ayrı; aynı varyanta birden fazla barkod.
- Barkodlar metindir; baştaki sıfırlar korunur. EAN/GTIN türünde kontrol basamağı doğrulanır; iç Code 128 ayrı türdür.
- Şube/depo bazında fiziksel, rezerve, satılabilir ve yoldaki stok.
- Mal kabul, alış iadesi, satış teslimi, müşteri iadesi, şubeler arası transfer, sayım ve kontrollü düzeltme.
- Sipariş rezervasyonu fiziksel çıkış değildir. Teslimde rezervasyon bir kez kapanır, stok bir kez düşer.
- USB/Bluetooth klavye tipi okuyucudan barkod + Enter desteği. Telefon kamerası ayrı cihaz testiyle değerlendirilir.
- Barkod etiketi ve A4 etiket çıktısı; termal etiket yazıcısında cihaz bazlı test.
- Özel reçeteli cam siparişi, stokta hazır cam ve çerçeve birbirinden ayrılır. Kontak lens için lot/son kullanma gereksinimi desteklenir.
- Negatif stok varsayılan kapalı; eşzamanlı iki satışta son ürün yalnızca bir siparişe ayrılabilir.
- Stok maliyet yöntemi işletme bazında muhasebeciyle belirlenir; geçmiş dönem maliyeti izinsiz değişmez.
Kabul: okutma → varyant bulma → rezervasyon → teslim → iade → sayım senaryoları gerçek okuyucu ve pilot mağazada doğrulanır.

## Roller
- İşletme sahibi/yönetici: işletme/şube raporları, yetkiler, onaylar, hesap ve kategori ayarları.
- Satış personeli: yetkili şube müşteri/sipariş/CRM ve tahsilat; gider, banka borcu ve şirket kârlılığına varsayılan erişim yok.
- Muhasebeci/finans: belge, satıcı cari, kart, banka, mutabakat, dönem kapanışı ve dışa aktarma; reçete/TCKN gibi alanlar iş gereği ayrıca yetkilendirilir.
- Depo/operasyon: ürün, mal kabul, rezervasyon, teslim iş listesi; müşteri/finans alanları asgari.
- SaaS platform yönetimi: abonelik ve hizmet durumu. Müşteri işletmelerin verilerine otomatik tam erişim verilmez.
Aynı kişi farklı işletmelerde farklı rollere sahip olabilir.

## Supabase mimarisi
Next.js + TypeScript uygulaması, PostgreSQL/Supabase Auth/özel Storage, GitHub kaynak kontrolü. Vercel planlanan dağıtım hedefidir.
- tenant_id ve branch_id; işletme üyelikleri davetlidir.
- RLS her iş tablosunda; tenant kapsamlı composite foreign key'ler yanlış işletme ilişkisini de engeller.
- Şifre/rol bilgisi tarayıcının düzenleyebildiği metadata'ya dayanmaz.
- Finansal kayıtlar transactional server/RPC üzerinden oluşur. Tarayıcı doğrudan posted fiş yazamaz.
- posted fiş dengesi ve stok transaction'ı sunucuda zorunlu. Idempotency key, optimistic version, gerektiğinde row lock.
- Tenant/rol negatif testleri gerçek RLS ile ayrı yapılır; örnek çekirdeğin tenant kontrolü bunların yerine geçmez.
- Değişiklik/audit kaydı; dönem kilidi; silme yerine ters kayıt ve düzeltme nedeni.
- Dosyalar özel bucket ve yetkili kısa süreli bağlantılarla.
- Şirket verisi, kod deposundan ayrı. Hesap anahtarları, gerçek müşteri ve banka belgeleri GitHub'a yüklenmez.
- Kayıt durumu taslak/gönderiliyor/sunucuda doğrulandı/hata olarak görünür; finansal işlem offline iken kaydedilmiş gibi gösterilmez.
- Veri bölgesi ve reçete/kimlik verilerinin aktarım gereklilikleri pilot veri geçişinden önce netleştirilir.

## Ürünleştirme ve ilk faz teslim sırası
1. Kaynak form envanteri, görsel/işlevsel kabul ölçütleri, muhasebeciyle işlem türleri ve hesap eşlemesi.
2. GitHub geliştirme dalı, React bileşenleri, kaynak formun görünümünü koruyan veri erişim adaptörü.
3. İşletme/şube/kullanıcı, Auth/RLS ve dosya yetkileri.
4. Ürün varyantları, barkod, stok hareketi ve rezervasyon.
5. Sipariş/CRM/reçete ve tahsilat; stok ve finans ile tek kaynak işlem bağlantısı.
6. Alış/gider belgeleri, cari, şirket kartı, banka, POS ve çift taraflı kayıt motoru.
7. Nakit raporu, ödeme planı, mutabakat, dönem kilidi, stok ve yönetim raporları.
8. Sheets deneme aktarımı; B64/JSON/sütun biçimleri ve ccDetails.payments desteği.
9. Pilot mağazada uçtan uca test; veri ve bakiye mutabakatı; yedekten geri dönüş provası.
10. Canlı pilot. Kuzmos markası altında başka işletme kurulumu, kullanıcı daveti, plan/abonelik ve destek süreçleri.
İlk faz canlı kabulünde stok ve barkod zorunludur; sonraya ertelenmez. Tasarım önizlemesi bu kapsamın tamamlandığı anlamına gelmez.

## Canlıya geçiş öncesi kabul kapıları
- Form alanı kaybı yok; müşteri, reçete, ürün ve tahsilat aktarımı doğrulandı.
- Sipariş ve kasa tahsilat toplamları eşit; tek ödeme tek finans hareketi.
- Seiko örneği, kısmi kart ödemesi, önceki ekstre borcu, avans, iade, POS ve kredi senaryoları.
- Her posted fiş dengeli; tenant ve yetki sınırları aşılmıyor.
- Stok rezervasyonu/teslim/iade çift çalışmıyor; eşzamanlı satış doğru.
- Gerçekleşen banka hareketleri ekstreyle, tedarikçi carileri belgelerle mutabık.
- Belirsiz farklar görünür, kapanış kontrolünde incelenmiş.
- Gerçek muhasebeci ve mağaza personeli kabul testi tamamlandı.

