# Kuzmos · Kasa

Kuzmos Kasa & Nakit Akış Modülü — Google Apps Script backend + web arayüzü.

Bu proje, tek dosyalık (`Macro.gs` + `Index.html`) eski sürümün, git ile
versiyonlanan, test edilebilir, modüler ve çok kullanıcılı bir Apps Script
projesine dönüştürülmüş halidir. Veritabanı hâlâ Google Sheets'tir (bilinçli
tercih — bkz. aşağıdaki "Neden hâlâ Google Sheets?" bölümü); asıl değişen,
kodun yapısı, kimlik doğrulama modeli ve geliştirme/dağıtım süreci.

## Eski sürüme göre neler değişti?

- **Tek dosya yerine modüler proje.** `Macro.gs` tek bir dosyaydı; artık
  `src/` altında sorumluluğa göre ayrılmış dosyalar var (`Auth.js`,
  `Hareketler.js`, `Cari.js`, `Banka.js`, `Tekrar.js`, `Siparis.js`,
  `Rapor.js`, `Setup.js`, `Main.js`, `Utils.js`, `Crypto.js`,
  `SheetService.js`, `Config.js`).
- **Ortak tek şifre yerine kişisel kullanıcı hesapları.** Her kullanıcının
  kendi e-postası ve şifresi var (`Kullanicilar` sayfası); kim ne zaman
  giriş yaptı, kim hangi hareketi kaydetti izlenebilir. Roller: `admin`
  (kullanıcı ekleyip pasif hale getirebilir, şifre sıfırlayabilir) ve
  `personel`.
- **Şifreler artık hash'lenmiş.** Düz metin veya tek SHA-256 yerine,
  kullanıcıya özel salt ile binlerce kez zincirlenmiş HMAC-SHA256
  (poor-man's PBKDF2) kullanılıyor — bkz. `src/Crypto.js`.
- **Kaba kuvvet koruması.** 15 dakikada 5 başarısız girişten sonra hesap
  geçici olarak kilitlenir (`src/Auth.js`).
- **Spreadsheet ID'leri artık kodda değil.** Script Properties'te tutulur
  (`ilkKurulum` ile bir kez ayarlanır), böylece ID'ler git geçmişine
  karışmaz.
- **"Kaydeden" alanı artık sahtesi yapılamaz.** Eskiden serbest metin
  girilebiliyordu; artık sunucu, oturum açan kullanıcının adını otomatik
  yazar.
- **Test edilebilir.** `test/` altında Jest testleri ve Apps Script
  global'lerinin (SpreadsheetApp, PropertiesService, CacheService,
  Utilities...) sahte (fake) implementasyonları var.
- **CI.** Her push'ta lint + test otomatik çalışır
  (`.github/workflows/ci.yml`).

Frontend (`Index.html`) görünüş/kullanım olarak neredeyse aynı kaldı —
ayrıca giriş ekranına e-posta alanı, Ayarlar sayfasına "Hesabım" ve
(yöneticiler için) "Kullanıcılar" paneli eklendi.

## Neden hâlâ Google Sheets?

Bu projeyi başlatırken üç seçenek konuşuldu: (1) Next.js + PostgreSQL gibi
tam bağımsız bir web uygulamasına geçmek, (2) ayrı backend/frontend servisi
kurmak, (3) mevcut Google Apps Script + Sheets altyapısını profesyonelleştirmek.
Üçüncü seçenek tercih edildi çünkü: kurulum/hosting maliyeti sıfır (Google
hesabı yeterli), muhasebeci/işletme sahibi verinin ham haline Sheets
üzerinden her zaman erişebiliyor, ve mevcut Sipariş sistemiyle entegrasyon
zaten Sheets üzerinden okuma şeklinde çalışıyor. Ölçek büyürse (çok yüksek
işlem hacmi, gerçek zamanlı çoklu kullanıcı çakışmaları) gerçek bir
veritabanına geçiş bu modüler yapı sayesinde daha kolay olacaktır — iş
mantığı zaten `SheetService.js` arkasında soyutlanmış durumda.

## Proje yapısı

```
src/
  appsscript.json     — Apps Script manifest (webapp erişimi, saat dilimi)
  Index.html           — Frontend (tek sayfa uygulama)
  Config.js            — Script Properties tabanlı yapılandırma
  Utils.js             — Saf yardımcı fonksiyonlar (cln_, dstr_, num_)
  Crypto.js            — Şifre hash'leme (salt + iteratif HMAC-SHA256)
  SheetService.js      — Genel spreadsheet/sayfa erişimi
  Auth.js              — Kullanıcılar, oturum, giriş kilitleme
  Ayarlar.js           — Anahtar/değer ayarları
  Hareketler.js        — Gelir/gider hareketleri (CRUD)
  Cari.js               — Tedarikçi bazlı planlanan ödemeler
  Banka.js              — Haftalık banka bakiye doğrulaması
  Tekrar.js             — Tekrarlayan ödemeler
  Siparis.js            — Sipariş sisteminden SALT OKUMA
  Rapor.js              — Aylık raporun Sheets'e yazılması
  Setup.js              — ilkKurulum() — tek seferlik kurulum
  Main.js               — doGet(), tumVeriGetir()
test/
  gasMocks.js           — Apps Script global'lerinin Jest sahteleri
  loadSrc.js            — src/*.js dosyalarını ortak global scope'a yükler
  *.test.js             — Jest testleri
.github/workflows/
  ci.yml                — lint + test (her push'ta)
  deploy.yml            — clasp push (manuel tetiklenir, secrets gerekir)
```

## Geliştirme ortamı kurulumu

```bash
npm install
npm test          # Jest testlerini çalıştırır
npm run lint       # ESLint
npm run format     # Prettier ile src/ ve test/ dosyalarını biçimlendirir
```

## Apps Script'e bağlama ve ilk kurulum

1. [clasp](https://github.com/google/clasp) kurulu değilse: `npm install`
   zaten devDependency olarak kurar; global kurulum isterseniz
   `npm install -g @google/clasp`.
2. `clasp login` ile Google hesabınızla giriş yapın.
3. Yeni bir Apps Script projesi oluşturun (script.google.com üzerinden veya
   `clasp create --type webapp --rootDir src`).
4. `.clasp.json.example` dosyasını `.clasp.json` olarak kopyalayıp
   `scriptId` alanına projenizin ID'sini yazın. `.clasp.json` git'e
   eklenmez (`.gitignore`'da).
5. `npm run clasp:push` ile `src/` içeriğini Apps Script'e gönderin.
6. Apps Script editöründe **Setup.js** dosyasını açın, `ilkKurulum`
   fonksiyonunu şu şekilde bir kez elle çalıştırın (fonksiyon adını
   seçip "Çalıştır"a basmadan önce parametreleri geçici olarak
   düzenleyip kaydedebilir, ya da Apps Script'in "Çalıştır" panelinden
   parametre girerek çağırabilirsiniz — en kolayı editörde alttaki gibi
   geçici bir sarmalayıcı fonksiyon yazıp onu çalıştırmaktır):

   ```js
   function _ilkKurulumCalistir() {
     ilkKurulum(
       'KASA_SPREADSHEET_ID_BURAYA',
       'SIPARIS_SPREADSHEET_ID_BURAYA', // opsiyonel, yoksa '' bırakın
       'admin@sirket.com',
       'Ad Soyad',
       'en-az-8-karakterlik-gecici-sifre'
     );
   }
   ```

   Bu, gerekli sayfaları oluşturur ve ilk yönetici kullanıcıyı ekler.
7. **Dağıt > Yeni dağıtım > Web uygulaması**: Çalıştıran = *Ben*,
   Erişim = *Bağlantıya sahip herkes* (bkz. `appsscript.json`).
8. Yönetici hesabıyla giriş yapıp Ayarlar sayfasından diğer kullanıcıları
   ekleyin.

## Dağıtım (CI/CD)

`.github/workflows/deploy.yml` manuel tetiklenen (`workflow_dispatch`) bir
GitHub Actions job'ıdır ve şu repo Secrets'larını gerektirir:

- `CLASPRC_JSON`: Yerel makinenizde `clasp login` çalıştırdıktan sonra
  oluşan `~/.clasprc.json` dosyasının tüm içeriği.
- `CLASP_JSON`: `.clasp.json.example` ile aynı biçimde, gerçek `scriptId`
  içeren JSON.

Bu secrets tanımlı değilse deploy workflow'u manuel çalıştırılmamalı;
günlük geliştirme `npm run clasp:push` ile yerelden yapılabilir.

## Güvenlik notları

- **Şifre hash'leme.** Apps Script'te bcrypt/scrypt yerleşik değildir. Bu
  yüzden `src/Crypto.js`, kullanıcıya özel bir salt ile HMAC-SHA256'yı
  binlerce kez zincirleyerek (poor-man's PBKDF2) kaba kuvvete karşı
  yavaşlatma sağlıyor. Bu, gerçek bcrypt/Argon2 kadar güçlü değildir.
  Çok daha yüksek güvenlik gerekiyorsa, kimlik doğrulama gerçek bir
  backend'e (örn. Firebase Auth, bir Cloud Function) taşınmalı.
  Tek bir işletme için düz metin/zayıf hash'e göre büyük bir iyileştirme
  olduğu için bu proje kapsamında yeterli görüldü.
  `src/Crypto.js` içindeki `PBKDF_ITERATIONS` sabitini artırarak
  güvenlik/performans dengesini ayarlayabilirsiniz.
- **Oturumlar** `CacheService`'te 6 saat geçerli token'lar olarak tutulur.
- **Giriş kilitleme**: 15 dakikada 5 başarısız denemeden sonra hesap
  geçici kilitlenir.
- **ESLint `no-undef: off`.** Apps Script'te tüm dosyalar tek bir global
  scope paylaşır (modül/`import` yok), bu yüzden `cln_` gibi başka
  dosyada tanımlı fonksiyonları çağırmak normaldir. ESLint bunu dosya
  başına değerlendirdiği için `no-undef` false-positive üretir; bu yüzden
  kapatıldı. Gerçek "tanımsız fonksiyon" hataları test suite'i ile
  yakalanır (`npm test`).

## Test yaklaşımı

`test/gasMocks.js`, Apps Script'in `SpreadsheetApp`, `PropertiesService`,
`CacheService`, `LockService` ve `Utilities` global'lerinin bellek-içi
sahte (fake) sürümlerini kurar. `src/*.js` dosyaları GAS'takiyle birebir
aynı kalır (build/transpile adımı yoktur); her dosyanın sonundaki

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ... };
  Object.keys(module.exports).forEach(function (k) { global[k] = module.exports[k]; });
}
```

bloğu, Apps Script'te no-op'tur (`module` tanımsız olduğu için çalışmaz),
ama Jest/Node içinde dosyanın fonksiyonlarını hem `require()` edilebilir
hem de GAS'takiyle aynı şekilde global olarak erişilebilir yapar —
böylece `test/loadSrc.js` dosyaları sırayla `require` ettiğinde, tıpkı
Apps Script'in tüm dosyaları tek bir global scope'ta birleştirmesi gibi
davranır.

## Bilinen sınırlamalar / gelecek işler

- Sipariş sistemi hâlâ ayrı bir Google Sheets projesi; entegrasyon salt
  okuma ile sınırlı (bilinçli tercih, bkz. yukarıdaki kısıt kararı).
- Geçmiş veri taşınmadı; sistem sıfırdan başlıyor (açılış kasası
  `ilkKurulum` sonrası Ayarlar sayfasından güncellenebilir).
- Şifre hash'leme gerçek bir backend'e taşınmadıkça bcrypt/Argon2
  seviyesinde değildir (yukarıya bakın).
