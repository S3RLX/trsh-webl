-- ============================================================
-- TRSH / RUDE TRASH — Supabase schema
-- Jalankan SEKALI di: Supabase Dashboard → SQL Editor → New query → Run
-- Aman dijalankan ulang (idempotent).
-- ============================================================

-- 1) ADMIN ---------------------------------------------------
-- Hanya email yang ada di tabel ini yang boleh menulis ke toko.
-- Tabel dikunci total (RLS aktif, tanpa policy); dicek lewat is_admin().
create table if not exists public.admins (
  email text primary key
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- 2) KONFIGURASI TOKO ---------------------------------------
-- 3 baris: settings (tema, konten, fitur), categories, products
create table if not exists public.store_data (
  key        text primary key check (key in ('settings', 'categories', 'products')),
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.store_data enable row level security;

drop policy if exists "store_data public read"  on public.store_data;
drop policy if exists "store_data admin insert" on public.store_data;
drop policy if exists "store_data admin update" on public.store_data;
drop policy if exists "store_data admin delete" on public.store_data;

create policy "store_data public read"  on public.store_data
  for select to anon, authenticated using (true);
create policy "store_data admin insert" on public.store_data
  for insert to authenticated with check (public.is_admin());
create policy "store_data admin update" on public.store_data
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "store_data admin delete" on public.store_data
  for delete to authenticated using (public.is_admin());

-- 3) PESANAN -------------------------------------------------
create table if not exists public.orders (
  id         text primary key check (char_length(id) between 3 and 64),
  status     text not null default 'new' check (status in ('new', 'paid', 'shipped', 'done', 'cancel')),
  total      numeric not null default 0 check (total >= 0),
  items      jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.orders enable row level security;

drop policy if exists "orders public insert" on public.orders;
drop policy if exists "orders admin select"  on public.orders;
drop policy if exists "orders admin insert"  on public.orders;
drop policy if exists "orders admin update"  on public.orders;
drop policy if exists "orders admin delete"  on public.orders;

-- Pembeli (anon) hanya boleh MEMBUAT pesanan baru, tidak bisa membaca/mengubah.
create policy "orders public insert" on public.orders
  for insert to anon, authenticated
  with check (
    status = 'new'
    and jsonb_typeof(items) = 'array'
    and jsonb_array_length(items) between 1 and 50
    and pg_column_size(items) < 20000
  );
create policy "orders admin select" on public.orders
  for select to authenticated using (public.is_admin());
create policy "orders admin insert" on public.orders
  for insert to authenticated with check (public.is_admin());
create policy "orders admin update" on public.orders
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "orders admin delete" on public.orders
  for delete to authenticated using (public.is_admin());

-- 4) SUBSCRIBER NEWSLETTER ----------------------------------
create table if not exists public.subscribers (
  email      text primary key
             check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  created_at timestamptz not null default now()
);
alter table public.subscribers enable row level security;

drop policy if exists "subscribers public insert" on public.subscribers;
drop policy if exists "subscribers admin select"  on public.subscribers;
drop policy if exists "subscribers admin insert"  on public.subscribers;
drop policy if exists "subscribers admin delete"  on public.subscribers;

create policy "subscribers public insert" on public.subscribers
  for insert to anon, authenticated with check (true);
create policy "subscribers admin select" on public.subscribers
  for select to authenticated using (public.is_admin());
create policy "subscribers admin insert" on public.subscribers
  for insert to authenticated with check (public.is_admin());
create policy "subscribers admin delete" on public.subscribers
  for delete to authenticated using (public.is_admin());

-- 5) HAK AKSES TABEL (dibatasi lagi oleh RLS di atas) -------
grant usage on schema public to anon, authenticated;

grant select                         on public.store_data  to anon, authenticated;
grant insert, update, delete         on public.store_data  to authenticated;

grant insert                         on public.orders      to anon;
grant select, insert, update, delete on public.orders      to authenticated;

grant insert                         on public.subscribers to anon;
grant select, insert, delete         on public.subscribers to authenticated;

-- 6) REALTIME -----------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['store_data', 'orders', 'subscribers'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 7) STORAGE: FOTO PRODUK -----------------------------------
-- Bucket publik (URL foto bisa dibuka siapa saja); hanya admin yang boleh upload/ubah/hapus.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "product-images admin all" on storage.objects;
create policy "product-images admin all" on storage.objects
  for all to authenticated
  using      (bucket_id = 'product-images' and public.is_admin())
  with check (bucket_id = 'product-images' and public.is_admin());

-- 8) DAFTARKAN EMAIL ADMIN ----------------------------------
-- Ganti email di bawah dengan email akun admin kamu (lihat README),
-- hapus tanda "--" di depan, lalu jalankan:
-- insert into public.admins (email) values ('emailkamu@contoh.com') on conflict do nothing;
