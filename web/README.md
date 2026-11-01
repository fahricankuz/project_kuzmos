# Kuzmos product preview

Önizlemeyi `previews/kuzmos-panels.html` dosyasını tarayıcıda açarak inceleyin. Yönetici, personel, muhasebe ve envanter panelleri örnek verilerle çalışır. Personel paneli `reference/sales/Index.html` içeriğini izole bir iframe içinde gösterir. Bu bir Supabase bağlantısı veya üretim entegrasyonu değildir.

`reference/sales/Index.html`, kullanıcının gönderdiği satış formunun metin referansıdır; mevcut `src/Index.html` ise eski kasa uygulamasıdır. İkisi karıştırılmamalıdır. Referansın rol/güvenlik kontrolleri canlı ürünün erişim modeli olarak kullanılamaz.

Finans prototipi testi: `node --test web/tests/journal.test.mjs` (Node.js 22+).

Kapsam ve ilk faz kabul ölçütleri: `docs/kuzmos-product-scope.md`.

Bu değişiklik mevcut Apps Script dosyalarını veya canlı dağıtımı değiştirmez. Kaynak formun mevcut kayıt/silme davranışı yeni ürüne aktarılmadan önce yetki, audit ve atomik kayıt kurallarıyla değiştirilmelidir.
