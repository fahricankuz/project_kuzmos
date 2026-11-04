# Kuzmos · Hostinger deneme yayını

Bu klasör güncel v0.7 arayüzünü açılış sayfası olarak sunar. Gerçek Supabase bağlantısı veya giriş koruması yoktur. Yalnızca örnek veri kullanın. Sayfa yenilenince kayıtlar sıfırlanır. Domain satın almak gerekmez; Hostinger geçici adresi kullanılabilir.

## En kolay yayın: statik dosya
1. Hostinger'da geçici domain ile boş bir HTML/PHP hosting sitesi oluşturun (Website Builder kullanmayın).
2. File Manager'da **yeni deneme sitesinin** public_html dizinine girin.
3. Bu klasördeki index.html dosyasını yükleyin. Alternatif ZIP paketini bu dizinde açın; index.html doğrudan public_html altında olmalı.
4. Yeni sitenin varsayılan karşılama index.php dosyası varsa kaldırın/yeniden adlandırın. Başka sitenin dosyalarına dokunmayın.
5. HTTPS geçici adresini açın. Finans (Özet, Yeni kayıt, Ödemeler, İnceleme, Raporlar), Envanter ve Personel sekmelerini deneyin. Dosya `node web/app/build.mjs` ile üretilir; elle düzenlemeyin.

Bu statik sürüm için Node.js, npm, API anahtarı, veritabanı veya build gerekmez. GitHub bağlantısının tek başına bu klasörü otomatik public_html içine kopyaladığını varsaymayın; statik dosya yükleme yöntemi bağımsızdır.

## GitHub / Node.js dağıtımı için hazırlanmış giriş
- Depo: fahricankuz/project_kuzmos
- Dal: codex/kuzmos-erp-preview
- Uygulama kökü: hostinger-preview (depo kökü veya web değil)
- Node: 24
- Build: npm run build
- Start: npm start
- Statik çıktı istenen dağıtımda: dist

Sunucu yalnızca Node'un kendi modüllerini kullanır; npm bağımlılığı yoktur. Hostinger arayüzünde özel Node başlangıç komutu/kök klasör seçimi destekleniyorsa bu ayarları kullanın. Çatı algılayıcı bu buildless Node projesini kabul etmezse statik dosya yükleme yolunu kullanın; bu klasör Next.js projesi olarak işaretlenmemelidir. Hostinger Node dağıtımı bu ortamdan doğrulanmadı.

## Yerel deneme
Bu klasörde Node 24 ile `npm start`, ardından http://localhost:3000. `PORT` değişkeni desteklenir. `npm test` sunucu cevaplarını, `npm run build` statik çıktıyı kontrol eder.

Bu paket mağaza üretim sistemi değildir. Canlıya geçiş için Supabase, kullanıcı/şirket yetkileri, sunucu tarafı finans/stok işlemleri ve veri aktarımı ayrıca tamamlanacaktır.
