/*
 * Supabase bağlantı bilgileri.
 *
 * Project Settings → API ekranından alınır:
 *   SUPABASE_URL      → "Project URL"
 *   SUPABASE_ANON_KEY → "anon public" anahtarı
 *
 * Bu iki değer GİZLİ DEĞİLDİR; tarayıcıya gömülmek üzere tasarlanmıştır.
 * Veriyi koruyan şey anahtarın saklanması değil, veritabanındaki RLS
 * politikalarıdır (bkz. supabase/migrations/0003_guvenlik.sql).
 *
 * "service_role" anahtarı ASLA buraya yazılmaz: o anahtar RLS'i baypas eder.
 */
window.KUZMOS_CONFIG = {
  SUPABASE_URL: 'BURAYA_PROJECT_URL',
  SUPABASE_ANON_KEY: 'BURAYA_ANON_PUBLIC_ANAHTAR'
};
