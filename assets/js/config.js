/* ==========================================================
   TRSH — konfigurasi Supabase
   Isi dua nilai di bawah dari:
   Supabase Dashboard → Project Settings → API (atau "API Keys")
   - SUPABASE_URL       : Project URL  (https://xxxx.supabase.co)
   - SUPABASE_ANON_KEY  : anon / publishable key
   Kunci anon AMAN dipublikasikan — keamanan dijaga oleh RLS (lihat supabase/schema.sql).
   JANGAN PERNAH menaruh service_role / secret key di file ini.
   Kosongkan keduanya untuk kembali ke mode lokal (localStorage).
   ========================================================== */
window.TRSH_CONFIG = {
  SUPABASE_URL: 'https://kgtjvbmtrijensdnsbsp.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndGp2Ym10cmlqZW5zZG5zYnNwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ2NjU0MjMsImV4cCI6MjExMDI0MTQyM30.QwJbkc0xvdl38yKM2wM_4aF8ZHvdNUVd3cFVhid-6bU',
  BUCKET: 'product-images',
};
