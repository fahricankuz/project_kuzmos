# v0.6 erişim durumu

Bu statik paket gerçek müşteri veya şirket verisi için YAYINA HAZIR DEĞİLDİR. Demo rol seçimi yalnız ekran akışını gösterir; kullanıcı kimliği doğrulamaz. Kaynak kod ve örnek veriler tarayıcıya gönderilir. Sekme gizlemek güvenlik değildir. Demo kullanıcı davet taslakları hesap açmaz ve e-posta göndermez.

## Gerçek erişim için zorunlu uygulama
- Supabase Auth: kişiye özel hesap, davet kabulü, şifre/oturum, çıkış ve pasif kullanıcı iptali.
- Şirket ve şube üyelikleri; roller admin/accountant/staff. Rol kullanıcı tarafından değiştirilemez.
- Personel: sipariş, müşteri ve satılabilir stok; finans, şirket kartı, şahsi ödemeler, kullanıcı yönetimi ve toplu stok değiştirme erişimi yok.
- Muhasebeci: finans, takvim, hesaplar, hareketler; satış reçetesi ve kullanıcı yetkilendirme erişimi yok.
- Yönetici: şirket içindeki tüm modüller, stok değişikliği ve kullanıcı davet/yetkilendirme.
- RLS ile tablo/satır erişimi ve sunucu fonksiyonlarında aynı yetki kontrolü. Personel sorgusunda finans verisi döndürülmez. Maliyet gibi kısıtlı kolonlar ayrıca ayrılır.
- Finans/stok yazımları atomik sunucu işlemi olmalı. Yönetici anahtarı tarayıcıda bulunmaz.
- Kabul testleri: başka şirketin verisini görme, doğrudan finans API isteği, kullanıcı rolünü değiştirme, pasif hesabın eski oturumu, dosya erişimi ve stok değiştirme girişimleri reddedilmeli.

Supabase projesi bu çalışma ortamına bağlı olmadığından bu maddeler henüz uygulanmış/çalıştırılmış değildir. Gerçek kullanıcı oluşturma ve üretim erişim güvenliği tamamlanmış sayılmaz.

## v0.6 ürün değişiklikleri
- Sabit beyaz tema, ay görünümünde ödeme takvimi (yönetici/finans), gün seçerek vade listesi.
- Gözlükte renk adı ve metin renk kodu; barkod ürün adında renk kodu da görünür. Excel'in eski 16 kolonu korunur; isteğe bağlı 17. kolon renk_kodu kabul edilir. Boş bırakılan eski dosya mevcut kodu silmez.
- Yönetici manuel ürün/stok girişi; Excel ile aynı varyant, barkod, rezerve stok ve tekrar referans kontrollerini kullanır.
- Hareketler & hesap özeti: plan, çek/senet teslimi, gerçek ödeme ve kart hareketleri; tarih/tür filtresi. Planlar nakit/kart toplamına katılmaz. Resmî mizan veya tam genel muhasebe değildir; sipariş tahsilatları henüz ortak deftere bağlı değildir.
- Demo kullanıcı davet taslakları yalnız yönetici ekranında; gerçek davet gönderilmez.
