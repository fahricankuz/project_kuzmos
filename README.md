# Kuzmos · Kasa

Kuzmos Kasa & Nakit Akış Modülü + Sipariş modülü — Google Apps Script
backend + web arayüzü, rol bazlı yetkilendirme ile tek projede birleşik.

Bu proje, tek dosyalık (`Macro.gs` + `Index.html`) eski sürümün, git ile
versiyonlanan, test edilebilir, modüler ve çok kullanıcılı bir Apps Script
projesine dönüştürülmüş halidir. Veritabanı hâlâ Google Sheets'tir (bilinçli
tercih — bkz. aşağıdaki "Neden hâlâ Google Sheets?" bölümü); asıl değişen,
kodun yapısı, kimlik doğrulama/yetkilendirme modeli ve geliştirme/dağıtım
süreci.

Başlangıçta sipariş formu ve kasa raporu ayrı Apps Script projeleriydi
(sipariş sistemine kasa tarafından sadece salt okuma erişimi vardı). Artık
ikisi tek bir projede, ortak kullanıcı/rol tablosu üzerinden birleştirildi:
mağaza, muhasebe ve yönetici aynı uygulamayı, kendi rolüne göre farklı
görüp farklı işlem yapabildikleri tek bir arayüzden kullanıyor.

## Roller

Üç rol var (`src/Auth.js` → `ROLLER`):

| Rol | Sipariş oluştur/gör | Kasa hareketleri, cari, banka, tekrar, rapor | Kullanıcı yönetimi |
| --- | --- | --- | --- |
| **magaza** | ✅ (kendi girdiğini düzenler/siler; hepsini görür) | ❌ | ❌ |
| **muhasebe** | ✅ (hepsini düzenler/siler) + finansal özet | ✅ | ❌ |
| **yonetici** | ✅ (hepsini düzenler/siler) + finansal özet | ✅ | ✅ |

Eski sürümdeki `admin`/`personel` rolleri sırasıyla `yonetici` ve
`muhasebe`'ye otomatik eşlenir (`rolNormallestir_`), böylece bu değişiklikten
önce eklenmiş kullanıcılar koda dokunulmadan çalışmaya devam eder.

## Eski sürüme göre neler değişti?

- **Sipariş formu artık ayrı bir proje değil.** `src/Siparis.js`, eskiden
  ayrı bir Google Sheets projesinden salt okuma yapan bir modülken, şimdi
  Kasa ile aynı spreadsheet içinde kendi sayfasına (`Siparisler`) hem yazan
  hem okuyan tam bir CRUD modülü (`siparisEkle`, `siparisGuncelle`,
  `siparisSil`, `siparisListele`, `siparisOzetiGetir`).
- **Rol modeli ikiden üçe çıktı.** `admin`/`personel` yerine
  `yonetici`/`muhasebe`/`magaza` — yukarıdaki tabloya bakın.
- **Tek dosya yerine modüler proje.** `Macro.gs` tek bir dosyaydı; artık
  `src/` altında sorumluluğa göre ayrılmış dosyalar var (`Auth.js`,
  `Hareketler.js`, `Cari.js`, `Banka.js`, `Tekrar.js`, `Siparis.js`,
  `Rapor.js`, `Setup.js`, `Main.js`, `Utils.js`, `Crypto.js`,
  `SheetService.js`, `Config.js`).
- **Ortak tek şifre yerine kişisel kullanıcı hesapları.** Her kullanıcının
  kendi e-postası ve şifresi var (`Kullanicilar` sayfası); kim ne zaman
  giriş yaptı, kim hangi hareketi/siparişi kaydetti izlenebilir.
- **Şifreler artık hash'lenmiş.** Düz metin veya tek SHA-256 yerine,
  kullanıcıya özel salt ile binlerce kez zincirlenmiş HMAC-SHA256
  (poor-man's PBKDF2) kullanılıyor — bkz. `src/Crypto.js`.
- **Kaba kuvvet koruması.** 15 dakikada 5 başarısız girişten sonra hesap
  geçici olarak kilitlenir (`src/Auth.js`).
- **Spreadsheet ID'si artık kodda değil.** Script Properties'te tutulur
  (`ilkKurulum` ile bir kez ayarlanır), böylece ID git geçmişine karışmaz.
- **"Kaydeden" alanı artık sahtesi yapılamaz.** Eskiden serbest metin
  girilebiliyordu; artık sunucu, oturum açan kullanıcının adını/e-postasını
  otomatik yazar.
- **Test edilebilir.** `test/` altında Jest testleri ve Apps Script
  global'lerinin (SpreadsheetApp, PropertiesService, CacheService,
  Utilities...) sahte (fake) implementasyonları var.
- **CI.** Her push'ta lint + test otomatik çalışır
  (`.github/workflows/ci.yml`).

Frontend (`Index.html`) rol bazlı: `yonetici`/`muhasebe` Özet, Rapor,
Hareketler, Planlanan, Banka, Yıllık, Sipariş ve Ayarlar sekmelerini görür;
`magaza` sadece Sipariş ve (sadece "Hesabım"ı içeren) Ayarlar sekmesini
görür. Giriş ekranına e-posta alanı, Ayarlar sayfasına "Hesabım" ve
(yalnızca yönetici için) "Kullanıcılar" paneli eklendi.

## Neden hâlâ Google Sheets?

Bu projeyi başlatırken üç seçenek konuşuldu: (1) Next.js + PostgreSQL gibi
tam bağımsız bir web uygulamasına geçmek, (2) ayrı backend/frontend servisi
kurmak, (3) mevcut Google Apps Script + Sheets altyapısını profesyonelleştirmek.
Üçüncü seçenek tercih edildi çünkü: kurulum/hosting maliyeti sıfır (Google
hesabı yeterli), ve muhasebeci/işletme sahibi verinin ham haline (kasa
hareketleri ve sipariş kayıtları dahil, artık aynı spreadsheet'te) Sheets
üzerinden her zaman erişebiliyor. Ölçek büyürse (çok yüksek
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
  Siparis.js            — Sipariş modülü (CRUD + finansal özet)
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
       'yonetici@sirket.com',
       'Ad Soyad',
       'en-az-8-karakterlik-gecici-sifre'
     );
   }
   ```

   Bu, gerekli sayfaları (kasa hareketleri, cari, banka, tekrarlayan,
   kullanıcılar, sipariş) oluşturur ve ilk `yonetici` kullanıcısını ekler.
7. **Dağıt > Yeni dağıtım > Web uygulaması**: Çalıştıran = *Ben*,
   Erişim = *Bağlantıya sahip herkes* (bkz. `appsscript.json`).
8. Yönetici hesabıyla giriş yapıp Ayarlar sayfasından diğer kullanıcıları
   (rolüne göre `magaza`, `muhasebe` veya `yonetici` seçerek) ekleyin.

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

- Eski (ayrı proje) sipariş sisteminden geçmiş veri taşınmadı; yeni
  `Siparisler` sayfası sıfırdan başlıyor. Açılış kasası `ilkKurulum`
  sonrası Ayarlar sayfasından güncellenebilir.
- Sipariş üzerinde iskonto/ekstra ücret gibi ürün toplamından bağımsız bir
  "genel tutar" alanı yok; sipariş tutarı her zaman ürün satırlarının
  (fiyat × adet) toplamıdır.
- Şifre hash'leme gerçek bir backend'e taşınmadıkça bcrypt/Argon2
  seviyesinde değildir (yukarıya bakın).
