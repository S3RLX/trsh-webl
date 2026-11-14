# TRSH / RUDE TRASH — Webstore

Webstore statis bergaya **Y2K × underground × minimalist** dengan panel admin realtime.
Tanpa build tools, tanpa dependency — cukup file HTML/CSS/JS.

## Struktur file

```
trsh/
├── index.html              # Toko (storefront)
├── admin.html              # Panel admin
├── README.md
├── supabase/
│   └── schema.sql          # tabel, RLS, realtime, bucket foto
└── assets/
    ├── css/
    │   ├── style.css       # Tema toko (semua warna/font via CSS variables)
    │   └── admin.css       # Tema panel admin
    └── js/
        ├── config.js       # ← ISI URL + anon key Supabase di sini
        ├── vendor/supabase.js  # supabase-js 2.99.3 (build UMD, disimpan lokal)
        ├── store.js        # Data layer: Supabase (DB, Auth, Realtime, Storage) + cache localStorage
        ├── app.js          # Logika toko: render, keranjang, wishlist, modal, efek
        └── admin.js        # Logika admin: CRUD, binding form, preview, backup
```

## Cara menjalankan

Buka `index.html` langsung di browser, atau (disarankan, agar sinkronisasi antar-tab stabil):

```bash
cd trsh
python3 -m http.server 8080
# toko  → http://localhost:8080/index.html
# admin → http://localhost:8080/admin.html
```

**Password admin default: `rude123`** (ganti di Admin → Sistem).

## Fitur admin (semua realtime)

| Menu | Isi |
|---|---|
| Dashboard | Statistik, stok menipis, pesanan terakhir, toggle maintenance |
| Produk | Tambah / edit / duplikat / hapus, harga, stok, ukuran, badge, featured, sembunyikan, upload banyak foto |
| Kategori | Tambah, rename, urutkan, sembunyikan, hapus |
| Tampilan | 6 preset tema, warna, font (20 pilihan), grid 2–5 kolom, rasio foto, radius, kecepatan animasi, 8 efek (grain, scanlines, cursor, glitch, tilt, …) |
| Konten | Brand, hero, marquee, announcement, countdown drop, about, newsletter, footer, sosmed |
| Fitur & Toko | On/off tiap seksi, keranjang, wishlist, search, sort, info stok, maintenance, nomor WhatsApp & template pesan, **flag kustom**, **Custom CSS**, **blok HTML tambahan** |
| Pesanan | Daftar order dari checkout, ubah status, export CSV, daftar subscriber |
| Sistem | Ganti password, export / import backup JSON, reset |

Tombol **LIVE PREVIEW** membuka toko di panel samping (mode desktop/mobile) yang ikut berubah saat Anda mengetik.

## Hubungkan ke Supabase (sekali saja)

1. **Buat project** di [supabase.com](https://supabase.com) → New project.
2. **Jalankan schema**: Dashboard → *SQL Editor* → New query → tempel isi `supabase/schema.sql` → *Run*.
3. **Buat akun admin**: *Authentication → Users → Add user → Create new user* (isi email + password, centang *Auto Confirm User*).
4. **Daftarkan email itu sebagai admin**: di SQL Editor jalankan
   ```sql
   insert into public.admins (email) values ('emailkamu@contoh.com');
   ```
5. **Matikan pendaftaran publik**: *Authentication → Sign In / Providers* → matikan *Allow new users to sign up*.
6. **Isi `assets/js/config.js`** dengan *Project URL* dan *anon/publishable key* (*Project Settings → API*). Jangan pakai `service_role`/secret key.
7. Buka `admin.html`, login dengan email + password tadi. Pertama kali login, data yang ada di browser (atau default) otomatis diunggah ke Supabase. Selesai.

## Cara kerja

| Data | Tabel / tempat | Siapa bisa |
|---|---|---|
| Pengaturan, tema, konten, produk, kategori | `store_data` (3 baris jsonb) | baca: semua · tulis: admin |
| Pesanan checkout | `orders` | buat: pembeli · baca/ubah/hapus: admin |
| Subscriber newsletter | `subscribers` | daftar: pengunjung · baca/hapus: admin |
| Foto produk | Storage bucket `product-images` | lihat: semua · upload/hapus: admin |
| Login admin | Supabase Auth + tabel `admins` | — |

- Setiap perubahan di admin disimpan otomatis (jeda ±0,5 detik) dan **tampil realtime di semua pengunjung** lewat Supabase Realtime.
- `localStorage` hanya dipakai sebagai cache agar toko tampil instan; sumber kebenaran adalah Supabase.
- Pesanan yang gagal terkirim (offline) disimpan sementara di browser pembeli dan dicoba lagi saat toko dibuka berikutnya.
- Kosongkan `config.js` untuk kembali ke **mode lokal** (localStorage, password `rude123`).

## Menambah fitur sendiri

- **Tanpa coding:** Admin → Fitur & Toko → *Fitur Kustom (flag)*. Flag `promo=on` menjadi
  `body[data-f-promo="on"]` dan `--c-promo` di toko; pakai di Custom CSS.
- **Dengan coding:** tambahkan field di `DEFAULTS` pada `store.js`, tampilkan di `app.js`,
  lalu buat input di `admin.js` dengan `data-path="settings.xxx"` — otomatis tersimpan & realtime.

## Catatan penting

- Dua admin yang mengedit bersamaan: simpanan terakhir yang menang (produk disimpan sebagai satu daftar).
- Custom CSS dan Blok HTML dari admin ditampilkan apa adanya di toko — hanya beri akses admin ke orang yang dipercaya.
- Foto yang dihapus dari produk tidak otomatis dihapus dari Storage (bisa dibersihkan manual di Dashboard bila perlu).
- Checkout tetap lewat **WhatsApp** (atur nomor di admin); pesanan juga tercatat di tab Pesanan.
- Font dimuat dari Google Fonts (butuh internet).
