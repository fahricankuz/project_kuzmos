/*
 * Supabase bağlantı bilgileri.
 *
 * Project Settings → API ekranından alınır:
 *   SUPABASE_URL      → "Project URL"
 *   SUPABASE_ANON_KEY → "Publishable key" veya eski "anon public" anahtarı
 *
 * Bu iki değer GİZLİ DEĞİLDİR; tarayıcıya gömülmek üzere tasarlanmıştır.
 * Veriyi koruyan şey anahtarın saklanması değil, veritabanındaki RLS
 * politikalarıdır (bkz. supabase/migrations/0003_guvenlik.sql).
 *
 * Bu ayarlar Kuzmos demo projesine aittir.
 * service_role ve sb_secret anahtarları sunucu tarafında tutulur.
 */
window.KUZMOS_CONFIG = {
  SUPABASE_URL: 'https://haqhtktrsbalkbjmlzlg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable__9ZhkIPx9t1p7aU818T4MQ_4qVis9aq'
};
