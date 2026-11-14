/* ==========================================================
   TRSH — admin panel logic
   Semua input terikat langsung ke data (data-path) dan
   tersimpan + tersinkron realtime ke toko setiap perubahan.
   ========================================================== */
(() => {
  'use strict';
  const T = window.TRSH;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const db = () => T.get();
  const S = () => T.get().settings;

  const TABS = [
    ['dashboard', 'Dashboard', '◐'], ['products', 'Produk', '▣'], ['categories', 'Kategori', '≡'],
    ['appearance', 'Tampilan', '◆'], ['content', 'Konten', '✎'], ['features', 'Fitur & Toko', '⚙'],
    ['orders', 'Pesanan', '✦'], ['system', 'Sistem', '⌘'],
  ];
  let tab = sessionStorage.getItem('trsh_tab') || 'dashboard';
  let editing = -1;
  let pq = '';

  /* ---------------- helpers ---------------- */
  let toastT;
  function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2300); }
  let flashT;
  function flashSaved() {
    if (T.remote) return; // mode Supabase: status dari T.onStatus (menunggu simpan ke database)
    const s = $('#saved'); s.textContent = '● TERSIMPAN ' + new Date().toLocaleTimeString('id-ID'); s.classList.add('flash');
    clearTimeout(flashT); flashT = setTimeout(() => s.classList.remove('flash'), 900);
  }
  T.onError = (err, kind) => {
    if (kind === 'remote') {
      const m = String((err && err.message) || err || '');
      toast(/JWT|expired|row-level|policy|401|403/i.test(m) ? 'SESI HABIS / BUKAN ADMIN — LOGIN ULANG' : 'GAGAL MENYIMPAN KE SUPABASE');
      console.error(err);
    } else toast('PENYIMPANAN PENUH — kurangi ukuran/jumlah foto');
  };
  T.onStatus = (st) => {
    const el = $('#saved'); if (!el) return;
    el.textContent = st.state === 'saving' ? '● MENYIMPAN…' : st.state === 'saved' ? '● TERSIMPAN ☁ ' + new Date().toLocaleTimeString('id-ID') : '● GAGAL SIMPAN';
    el.classList.toggle('flash', st.state === 'saved');
  };
  const slug = (s) => String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
  const dl = (name, text, type) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 500); };

  /* field builders — setiap field punya data-path agar terikat otomatis */
  const val = (p) => T.getPath(db(), p);
  const fText = (label, path, o = {}) => `<label class="f"><span>${esc(label)}</span><input type="${o.type || 'text'}" data-path="${path}" value="${esc(val(path))}" placeholder="${esc(o.ph || '')}"></label>`;
  const fNum = (label, path, o = {}) => `<label class="f"><span>${esc(label)}</span><input type="number" data-type="num" data-path="${path}" value="${esc(val(path))}" ${o.min != null ? `min="${o.min}"` : ''} placeholder="${esc(o.ph || '')}"></label>`;
  const fArea = (label, path, o = {}) => `<label class="f"><span>${esc(label)}</span><textarea class="${o.code ? 'code' : ''}" data-path="${path}" rows="${o.rows || 4}" ${o.code ? 'spellcheck="false"' : ''} placeholder="${esc(o.ph || '')}">${esc(val(path))}</textarea></label>`;
  const fColor = (label, path) => `<label class="f"><span>${esc(label)}</span><input type="color" data-path="${path}" value="${esc(val(path))}"></label>`;
  const fRange = (label, path, min, max, step) => `<label class="f"><span>${esc(label)}</span><div class="rng"><input type="range" data-type="num" data-path="${path}" min="${min}" max="${max}" step="${step}" value="${val(path)}"><output>${val(path)}</output></div></label>`;
  const fSelect = (label, path, opts, num) => `<label class="f"><span>${esc(label)}</span><select data-path="${path}" ${num ? 'data-type="num"' : ''}>${opts.map((o) => `<option value="${esc(o[0])}" ${String(val(path)) === String(o[0]) ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;
  const fTog = (label, path, hint) => `<label class="tg"><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span><input type="checkbox" data-type="bool" data-path="${path}" ${val(path) ? 'checked' : ''}><i></i></label>`;
  const fontOpts = () => T.FONTS.map((f) => [f.n, f.n]);

  /* ---------------- binding ---------------- */
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-path]')) {
      const t = el.dataset.type || 'str';
      let v;
      if (t === 'bool') v = el.checked;
      else if (t === 'num') v = el.value === '' ? 0 : Number(el.value);
      else if (t === 'list') v = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else v = el.value;
      T.set(el.dataset.path, v);
      const o = el.parentElement && el.parentElement.querySelector('output'); if (o) o.textContent = v;
      if (el.dataset.path === 'settings.brand.name') $('#brandName').textContent = v;
      flashSaved();
    } else if (el.id === 'pq') {
      pq = el.value; $('#ptbody').innerHTML = productRows();
    }
  });

  /* ---------------- views ---------------- */
  function vDashboard() {
    const d = db(), o = T.orders.list();
    const low = d.products.filter((p) => p.active !== false && p.stock > 0 && p.stock <= d.settings.store.lowStock);
    const out = d.products.filter((p) => p.stock <= 0);
    const kb = (T.size() / 1024).toFixed(0);
    return `<div class="stats">
      <div class="stat acc"><span class="mono dim">PRODUK AKTIF</span><b>${d.products.filter((p) => p.active !== false).length}<small class="dim" style="font-size:14px"> / ${d.products.length}</small></b></div>
      <div class="stat"><span class="mono dim">KATEGORI</span><b>${d.categories.length}</b></div>
      <div class="stat"><span class="mono dim">PESANAN BARU</span><b>${o.filter((x) => x.status === 'new').length}</b></div>
      <div class="stat"><span class="mono dim">SUBSCRIBER</span><b>${d.subscribers.length}</b></div>
      <div class="stat"><span class="mono dim">PENYIMPANAN</span><b>${kb}<small class="dim" style="font-size:14px"> KB / ~5000</small></b></div></div>
    <div class="grid2">
      <div class="box"><h3>Aksi Cepat</h3>
        <div class="pre"><button class="btn acc" data-a="go-products-new">+ PRODUK BARU</button><button class="btn" data-a="go-categories">KATEGORI</button><button class="btn" data-a="go-appearance">TEMA</button><button class="btn" data-a="pv">LIVE PREVIEW</button></div>
        <p class="hint">Semua perubahan tersimpan otomatis dan langsung tampil di toko yang sedang terbuka (tab lain maupun preview di samping).</p>
        ${fTog('Mode Maintenance', 'settings.store.maintenance', 'Tutup toko sementara untuk pengunjung')}
      </div>
      <div class="box"><h3>Stok Perlu Perhatian</h3>
        ${low.length || out.length ? [...low.map((p) => `<div class="tg" style="cursor:default"><span><b>${esc(p.name)}</b><small>Sisa ${p.stock}</small></span><span class="pill">LOW</span></div>`), ...out.map((p) => `<div class="tg" style="cursor:default"><span><b>${esc(p.name)}</b><small>Habis</small></span><span class="pill no">OUT</span></div>`)].join('') : '<p class="hint">Semua stok aman ✦</p>'}
      </div>
      <div class="box wide"><h3>Pesanan Terakhir <button class="lnk" data-a="go-orders">LIHAT SEMUA →</button></h3>
        ${o.length ? o.slice(0, 5).map((x) => `<div class="tg" style="cursor:default"><span><b>${esc(x.id)}</b><small>${new Date(x.time).toLocaleString('id-ID')} · ${x.items.length} item</small></span><b>${T.money(x.total)}</b></div>`).join('') : '<p class="hint">Belum ada pesanan. Pesanan masuk saat pembeli menekan Checkout di toko.</p>'}
      </div></div>`;
  }

  function productRows() {
    const q = pq.toLowerCase();
    const rows = db().products.map((p, i) => [p, i]).filter(([p]) => !q || (p.name + ' ' + p.category).toLowerCase().includes(q));
    if (!rows.length) return '<div class="empty">Belum ada produk.</div>';
    return rows.map(([p, i]) => {
      const im = p.images && p.images[0] ? p.images[0] : T.placeholder(p, 0);
      const cat = db().categories.find((c) => c.id === p.category);
      return `<div class="tr"><img src="${esc(im)}" alt="">
        <div class="nm"><b>${esc(p.name)}</b><span>${esc(cat ? cat.name : '—')}${p.featured ? ' · ★ FEATURED' : ''}</span></div>
        <span class="hid">${T.money(p.price)}</span><span class="hid">${p.stock}</span>
        <span class="hid"><span class="pill ${p.active !== false ? 'ok' : 'no'}">${p.active !== false ? 'AKTIF' : 'HIDDEN'}</span></span>
        <div class="acts"><button class="btn sm" data-a="p-edit" data-i="${i}">EDIT</button><button class="btn sm" data-a="p-dup" data-i="${i}">⧉</button><button class="btn sm danger" data-a="p-del" data-i="${i}">✕</button></div></div>`;
    }).join('');
  }
  function vProducts() {
    return `<div class="bar"><input class="inp" id="pq" placeholder="Cari produk…" value="${esc(pq)}"><button class="btn acc" data-a="p-add">+ PRODUK BARU</button></div>
      <div class="tbl"><div class="tr th"><span></span><span>Produk</span><span class="hid">Harga</span><span class="hid">Stok</span><span class="hid">Status</span><span></span></div><div id="ptbody">${productRows()}</div></div>`;
  }

  function editorHTML(i) {
    const p = db().products[i]; if (!p) return '';
    const b = 'products.' + i + '.';
    const catOpts = [['', '— Tanpa kategori —']].concat(db().categories.map((c) => [c.id, c.name]));
    const imgs = (p.images || []).map((u, k) => `<div class="im ${k === 0 ? 'main' : ''}"><img src="${esc(u)}" alt=""><button class="rm" data-a="img-del" data-k="${k}" title="Hapus">✕</button>${k > 0 ? `<button class="mk" data-a="img-main" data-k="${k}" title="Jadikan utama">★</button>` : ''}</div>`).join('');
    return `<div class="pn-h"><h3>Edit Produk</h3><button class="btn sm" data-a="p-close">TUTUP ✕</button></div>
      <div class="pn-b">
        ${fText('Nama produk', b + 'name')}
        <div class="row2">${fNum('Harga', b + 'price', { min: 0 })}${fNum('Stok', b + 'stock', { min: 0 })}</div>
        <div class="row2">${fSelect('Kategori', b + 'category', catOpts)}${fText('Badge (NEW / LIMITED …)', b + 'badge', { ph: 'opsional' })}</div>
        <label class="f"><span>Ukuran (pisahkan dengan koma)</span><input type="text" data-type="list" data-path="${b}sizes" value="${esc((p.sizes || []).join(', '))}" placeholder="S, M, L, XL"></label>
        ${fArea('Deskripsi', b + 'desc', { rows: 4 })}
        <div class="row2">${fTog('Tampilkan di toko', b + 'active')}${fTog('Featured (urut paling atas)', b + 'featured')}</div>
        <div class="f"><span>Foto produk (foto pertama = utama, foto kedua tampil saat hover)</span>
          <div class="imgs">${imgs}</div>
          <label class="drop">+ UPLOAD FOTO (bisa banyak)<input type="file" id="fileIn" accept="image/*" multiple hidden></label>
          <div class="row2" style="grid-template-columns:1fr auto"><input class="inp" id="imgUrl" placeholder="atau tempel URL gambar https://…"><button class="btn" data-a="img-url">TAMBAH</button></div>
          <p class="hint dim" style="font-size:12px">Tanpa foto, toko memakai visual placeholder otomatis. Foto upload dikompres ke ±900px dan disimpan di browser.</p></div>
      </div>
      <div class="pn-f"><button class="btn danger" data-a="p-del" data-i="${i}">HAPUS PRODUK</button><button class="btn acc" data-a="p-close">SELESAI ✓</button></div>`;
  }
  function openEditor(i) {
    editing = i; $('#panel').innerHTML = editorHTML(i);
    $('#panel').classList.add('open'); $('#scrim').classList.add('on');
  }
  function closeEditor() {
    editing = -1; $('#panel').classList.remove('open'); $('#scrim').classList.remove('on');
    if (tab === 'products') $('#ptbody').innerHTML = productRows();
    if (tab === 'dashboard') render();
  }

  function vCategories() {
    const cats = db().categories;
    return `<div class="grid2"><div class="box wide"><h3>Kategori Katalog</h3>
      <p class="hint">Ubah nama, urutan, dan visibilitas kategori. Perubahan tampil langsung sebagai filter di toko.</p>
      <div class="tbl">${cats.length ? cats.map((c, i) => `<div class="crow">
        <input class="inp" data-path="categories.${i}.name" value="${esc(c.name)}">
        <label class="tg" style="padding:7px 10px"><span class="mono">TAMPIL</span><input type="checkbox" data-type="bool" data-path="categories.${i}.visible" ${c.visible ? 'checked' : ''}><i></i></label>
        <span class="mono dim">${db().products.filter((p) => p.category === c.id).length} PRODUK</span>
        <div class="acts" style="display:flex;gap:6px"><button class="btn sm" data-a="c-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn sm" data-a="c-dn" data-i="${i}" ${i === cats.length - 1 ? 'disabled' : ''}>↓</button><button class="btn sm danger" data-a="c-del" data-i="${i}">✕</button></div></div>`).join('') : '<div class="empty">Belum ada kategori.</div>'}</div>
      <div class="bar" style="margin:0"><input class="inp" id="newCat" placeholder="Nama kategori baru…"><button class="btn acc" data-a="c-add">+ TAMBAH KATEGORI</button></div></div></div>`;
  }

  const PRESETS = {
    ACID: { bg: '#09090b', fg: '#ececf0', muted: '#8b8b95', card: '#101013', accent: '#c8ff2e', line: '#26262c' },
    CHROME: { bg: '#0b0b0e', fg: '#f1f1f5', muted: '#9a9aa6', card: '#121218', accent: '#d7dae8', line: '#2a2a33' },
    BLOOD: { bg: '#0a0708', fg: '#f2eaea', muted: '#8f7f81', card: '#140d0e', accent: '#ff2a3d', line: '#2b1b1d' },
    ICE: { bg: '#07090c', fg: '#e9f3f7', muted: '#7f929b', card: '#0d1318', accent: '#7fe7ff', line: '#1b2730' },
    'Y2K PINK': { bg: '#0b080c', fg: '#f6ecf4', muted: '#9a8396', card: '#150f16', accent: '#ff4fd8', line: '#2c1e2d' },
    PAPER: { bg: '#e9e9e4', fg: '#0b0b0c', muted: '#6b6b66', card: '#f4f4ef', accent: '#ff3b00', line: '#cfcfc8' },
  };
  function vAppearance() {
    return `<div class="grid2">
      <div class="box wide"><h3>Preset Tema</h3><div class="pre">${Object.keys(PRESETS).map((k) => `<button class="sw" data-a="preset" data-k="${esc(k)}"><u><s style="background:${PRESETS[k].bg};border:1px solid #444"></s><s style="background:${PRESETS[k].accent}"></s></u>${esc(k)}</button>`).join('')}</div></div>
      <div class="box"><h3>Warna</h3><div class="row3">${fColor('Background', 'settings.theme.bg')}${fColor('Teks', 'settings.theme.fg')}${fColor('Aksen', 'settings.theme.accent')}</div><div class="row3">${fColor('Teks redup', 'settings.theme.muted')}${fColor('Kartu', 'settings.theme.card')}${fColor('Garis', 'settings.theme.line')}</div></div>
      <div class="box"><h3>Font</h3>${fSelect('Display (judul)', 'settings.theme.displayFont', fontOpts())}${fSelect('Body', 'settings.theme.bodyFont', fontOpts())}${fSelect('Mono (label)', 'settings.theme.monoFont', fontOpts())}<p class="hint">Font dimuat dari Google Fonts (butuh internet di sisi pengunjung).</p></div>
      <div class="box"><h3>Layout Katalog</h3>${fSelect('Kolom grid (desktop)', 'settings.theme.gridCols', [[2, '2 kolom'], [3, '3 kolom'], [4, '4 kolom'], [5, '5 kolom']], true)}${fSelect('Rasio foto produk', 'settings.theme.ratio', [['4/5', '4:5 Portrait'], ['3/4', '3:4 Portrait'], ['1/1', '1:1 Square'], ['2/3', '2:3 Tall'], ['4/3', '4:3 Landscape']])}${fRange('Radius sudut (px)', 'settings.theme.radius', 0, 24, 1)}${fRange('Kecepatan animasi', 'settings.theme.animSpeed', 0.3, 2.5, 0.1)}</div>
      <div class="box"><h3>Efek Visual</h3>${fTog('Preloader', 'settings.effects.preloader', 'Animasi loading saat membuka toko')}${fTog('Film grain', 'settings.effects.grain', 'Tekstur noise halus')}${fTog('Scanlines', 'settings.effects.scanlines', 'Garis CRT ala Y2K')}${fTog('Custom cursor', 'settings.effects.cursor', 'Hanya perangkat mouse')}${fTog('Reveal saat scroll', 'settings.effects.reveal')}${fTog('Glitch judul (hover)', 'settings.effects.glitch')}${fTog('Tilt 3D kartu produk', 'settings.effects.tilt')}${fTog('Sparkle & ring hero', 'settings.effects.sparkles')}</div></div>`;
  }

  function vContent() {
    return `<div class="grid2">
      <div class="box"><h3>Brand</h3>${fText('Nama singkat (logo)', 'settings.brand.name')}${fText('Nama lengkap (wordmark footer)', 'settings.brand.fullName')}${fText('Tagline', 'settings.brand.tagline')}</div>
      <div class="box"><h3>Hero</h3>${fText('Eyebrow', 'settings.hero.eyebrow')}<div class="row2">${fText('Judul baris 1', 'settings.hero.line1')}${fText('Judul baris 2 (chrome)', 'settings.hero.line2')}</div>${fArea('Sub-teks', 'settings.hero.sub', { rows: 3 })}<div class="row2">${fText('Teks tombol', 'settings.hero.cta')}${fText('Link tombol', 'settings.hero.ctaLink')}</div>${fTog('Tampilkan sticker berputar', 'settings.hero.showSticker')}${fText('Teks sticker', 'settings.hero.sticker')}</div>
      <div class="box"><h3>Announcement & Marquee</h3>${fTog('Tampilkan announcement bar', 'settings.announcement.enabled')}${fText('Teks announcement', 'settings.announcement.text')}${fText('Teks marquee (berjalan)', 'settings.marquee.text')}${fRange('Durasi marquee (detik, makin kecil makin cepat)', 'settings.marquee.speed', 8, 80, 1)}</div>
      <div class="box"><h3>Drop Countdown</h3>${fText('Judul', 'settings.drop.title')}${fText('Catatan', 'settings.drop.note')}${fText('Tanggal & waktu drop', 'settings.drop.date', { type: 'datetime-local' })}<p class="hint">Setelah waktunya lewat, hitung mundur menampilkan 00 berwarna aksen (LIVE).</p></div>
      <div class="box"><h3>Katalog</h3>${fText('Kicker', 'settings.shop.kicker')}${fText('Judul seksi', 'settings.shop.title')}</div>
      <div class="box"><h3>About / Manifesto</h3>${fText('Kicker', 'settings.about.kicker')}${fArea('Judul (Enter = baris baru)', 'settings.about.title', { rows: 2 })}${fArea('Teks', 'settings.about.text', { rows: 5 })}</div>
      <div class="box"><h3>Newsletter & Footer</h3>${fText('Judul newsletter', 'settings.footer.newsletterTitle')}${fText('Teks newsletter', 'settings.footer.newsletterText')}${fText('Teks footer', 'settings.footer.text')}</div>
      <div class="box"><h3>Sosial Media</h3>${fText('Instagram URL', 'settings.social.instagram', { type: 'url' })}${fText('TikTok URL', 'settings.social.tiktok', { type: 'url' })}${fText('Email', 'settings.social.email', { type: 'email' })}</div></div>`;
  }

  function vFeatures() {
    const fl = S().custom.flags || [];
    return `<div class="grid2">
      <div class="box"><h3>Seksi Halaman</h3>${fTog('Hero', 'settings.sections.hero')}${fTog('Marquee', 'settings.sections.marquee')}${fTog('Drop countdown', 'settings.sections.drop')}${fTog('Katalog produk', 'settings.sections.shop')}${fTog('Blok HTML tambahan', 'settings.sections.extra', 'Isi di bagian “Blok HTML” di bawah')}${fTog('About / Manifesto', 'settings.sections.about')}${fTog('Newsletter', 'settings.sections.newsletter')}</div>
      <div class="box"><h3>Fitur Toko</h3>${fTog('Keranjang & checkout', 'settings.store.cart')}${fTog('Wishlist (♡ saved)', 'settings.store.wishlist')}${fTog('Pencarian', 'settings.store.search')}${fTog('Urutkan', 'settings.store.sort')}${fTog('Tampilkan info stok', 'settings.store.showStock')}${fNum('Batas “stok menipis”', 'settings.store.lowStock', { min: 0 })}${fTog('Mode maintenance', 'settings.store.maintenance')}${fText('Pesan maintenance', 'settings.store.maintenanceText')}</div>
      <div class="box"><h3>Checkout (WhatsApp)</h3>${fText('Nomor WhatsApp (format 62…)', 'settings.store.whatsapp', { ph: '6281234567890' })}${fText('Simbol mata uang', 'settings.store.currency')}${fArea('Template pesan', 'settings.store.template', { rows: 7 })}<p class="hint">Gunakan <code>{items}</code> untuk daftar barang dan <code>{total}</code> untuk total.</p></div>
      <div class="box"><h3>Fitur Kustom (flag) <button class="btn sm" data-a="f-add">+ TAMBAH</button></h3>
        <p class="hint">Tambah setting bebas. Tiap flag otomatis menjadi atribut <code>body[data-f-key="value"]</code> dan variabel CSS <code>--c-key</code> di toko — bisa dipakai di Custom CSS untuk menyalakan/mematikan gaya apa pun secara realtime.</p>
        ${fl.length ? fl.map((f, i) => `<div class="frow">${fText('Key', `settings.custom.flags.${i}.key`, { ph: 'promo' })}${fText('Label', `settings.custom.flags.${i}.label`, { ph: 'Mode promo' })}${fText('Value', `settings.custom.flags.${i}.value`, { ph: 'on' })}<button class="btn sm danger" data-a="f-del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada flag.</p>'}</div>
      <div class="box wide"><h3>Custom CSS</h3><p class="hint">Contoh: <code>body[data-f-promo="on"] .badge.hot{background:#ff2a3d}</code></p>${fArea('CSS tambahan (diterapkan langsung)', 'settings.custom.css', { code: true })}</div>
      <div class="box wide"><h3>Blok HTML Tambahan</h3><p class="hint">Disisipkan sebagai seksi di antara katalog dan about (aktifkan di “Seksi Halaman”). Gunakan untuk banner, lookbook, FAQ, dll.</p>${fArea('HTML', 'settings.custom.extraHtml', { code: true })}</div></div>`;
  }

  const STATUS = [['new', 'BARU'], ['paid', 'DIBAYAR'], ['shipped', 'DIKIRIM'], ['done', 'SELESAI'], ['cancel', 'BATAL']];
  function vOrders() {
    const o = T.orders.list(), subs = db().subscribers;
    return `<div class="bar"><button class="btn" data-a="o-csv">EXPORT CSV</button><button class="btn danger" data-a="o-clear">HAPUS SEMUA</button></div>
      <div class="tbl">${o.length ? o.map((x) => `<div class="ord"><div class="ord-h"><div><b>${esc(x.id)}</b> <span class="mono dim">${new Date(x.time).toLocaleString('id-ID')}</span></div>
        <div style="display:flex;gap:8px;align-items:center"><b>${T.money(x.total)}</b><select data-a="o-st" data-id="${esc(x.id)}">${STATUS.map((s) => `<option value="${s[0]}" ${x.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select><button class="btn sm danger" data-a="o-del" data-id="${esc(x.id)}">✕</button></div></div>
        <ul>${x.items.map((it) => `<li>${esc(it.name)}${it.size ? ' [' + esc(it.size) + ']' : ''} × ${it.qty} — ${T.money(it.price * it.qty)}</li>`).join('')}</ul></div>`).join('') : '<div class="empty">Belum ada pesanan.<br><span class="dim">Pesanan tercatat saat pembeli menekan Checkout di toko' + (T.remote ? '' : ' (browser yang sama)') + '.</span></div>'}</div>
      <div class="box" style="margin-top:18px"><h3>Subscriber Newsletter (${subs.length}) <button class="btn sm" data-a="s-csv">EXPORT</button></h3>${subs.length ? subs.map((s) => `<div class="tg" style="cursor:default"><span><b>${esc(s.email)}</b><small>${new Date(s.time).toLocaleString('id-ID')}</small></span></div>`).join('') : '<p class="hint">Belum ada subscriber.</p>'}</div>`;
  }

  function vSystem() {
    const R = T.remote;
    return `<div class="grid2">
      <div class="box"><h3>Keamanan Admin</h3>${R
        ? `<p class="hint">Login sebagai <b>${esc(T.auth.user)}</b> (Supabase Auth).</p><label class="f"><span>Password baru</span><input type="password" id="newPw" placeholder="minimal 8 karakter" autocomplete="new-password"></label><button class="btn acc" data-a="pw">GANTI PASSWORD</button>`
        : `<label class="f"><span>Password baru</span><input type="password" id="newPw" placeholder="minimal 4 karakter"></label><button class="btn acc" data-a="pw">SIMPAN PASSWORD</button>
        <p class="hint">Mode lokal: login ini hanya penghalang di sisi browser, bukan keamanan sungguhan. Hubungkan Supabase (assets/js/config.js) untuk login yang aman.</p>`}</div>
      <div class="box"><h3>Backup & Restore</h3><p class="hint">Ekspor semua data (produk, kategori, pengaturan, pesanan) ke file JSON, atau impor dari backup.</p>
        <div class="pre"><button class="btn acc" data-a="exp">EXPORT JSON</button><label class="btn" style="cursor:pointer">IMPORT JSON<input type="file" id="impIn" accept="application/json" hidden></label></div></div>
      <div class="box"><h3>Reset</h3><p class="hint">Kembalikan seluruh produk, kategori, dan pengaturan ke bawaan. Pesanan tidak dihapus.</p><button class="btn danger" data-a="reset">RESET KE DEFAULT</button></div>
      <div class="box"><h3>Koneksi</h3>${R
        ? `<p class="hint"><b>Supabase terhubung ☁</b> — produk, kategori, pengaturan, pesanan, subscriber, dan foto tersimpan di database dan tampil realtime ke semua pengunjung.</p>`
        : `<p class="hint"><b>Mode lokal</b> — data hanya di browser ini (${(T.size() / 1024).toFixed(0)} KB dari ±5000 KB). Isi <code>assets/js/config.js</code> untuk menghubungkan Supabase.</p>`}</div></div>`;
  }

  const VIEWS = { dashboard: vDashboard, products: vProducts, categories: vCategories, appearance: vAppearance, content: vContent, features: vFeatures, orders: vOrders, system: vSystem };

  function render() {
    const t = TABS.find((x) => x[0] === tab) || TABS[0];
    $('#title').textContent = t[1];
    $('#nav').innerHTML = TABS.map((x) => `<button class="${x[0] === tab ? 'on' : ''}" data-a="tab" data-t="${x[0]}"><span>${x[2]}</span>${x[1]}</button>`).join('');
    $('#view').innerHTML = (VIEWS[tab] || vDashboard)();
    $('#brandName').textContent = S().brand.name;
  }
  function go(t) { tab = t; sessionStorage.setItem('trsh_tab', t); render(); $('#view').scrollTop = 0; }

  /* ---------------- image upload ---------------- */
  function fileToData(file, max) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = rej;
      fr.onload = () => {
        const im = new Image();
        im.onerror = rej;
        im.onload = () => {
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
          c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
          if (T.remote && T.auth.isAdmin()) c.toBlob((b) => { if (!b) rej(new Error('Gagal memproses gambar')); else T.uploadImage(b).then(res, rej); }, 'image/jpeg', 0.85);
          else res(c.toDataURL('image/jpeg', 0.82));
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (el.id === 'fileIn' && editing >= 0) {
      const files = [...el.files];
      for (const f of files) { try { const u = await fileToData(f, T.remote ? 1400 : 900); T.update((d) => d.products[editing].images.push(u)); } catch (err) { console.error(err); toast('Gagal ' + (T.remote ? 'upload ' : 'membaca ') + f.name); } }
      openEditor(editing); flashSaved();
    } else if (el.id === 'impIn') {
      const f = el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { try { T.importJSON(r.result); toast('IMPORT BERHASIL ✦'); render(); } catch (err) { toast('File tidak valid'); } };
      r.readAsText(f);
    } else if (el.matches('select[data-a="o-st"]')) {
      T.orders.update(el.dataset.id, { status: el.value }); flashSaved();
    }
  });

  /* ---------------- actions ---------------- */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-a]');
    if (!el) { if (e.target.id === 'scrim') closeEditor(); return; }
    if (el.tagName === 'SELECT') return;
    const a = el.dataset.a, i = Number(el.dataset.i);
    const d = db();
    switch (a) {
      case 'tab': go(el.dataset.t); break;
      case 'go-products-new': go('products'); addProduct(); break;
      case 'go-categories': go('categories'); break;
      case 'go-appearance': go('appearance'); break;
      case 'go-orders': go('orders'); break;
      case 'logout': sessionStorage.removeItem('trsh_auth'); (T.remote ? T.auth.signOut() : Promise.resolve()).catch(() => {}).then(() => location.reload()); break;
      case 'pv': togglePreview(); break;
      case 'pv-d': $('.pv-wrap').classList.remove('mobile'); $('#pvD').classList.add('on'); $('#pvM').classList.remove('on'); break;
      case 'pv-m': $('.pv-wrap').classList.add('mobile'); $('#pvM').classList.add('on'); $('#pvD').classList.remove('on'); break;
      case 'pv-r': $('#pvFrame').src = 'index.html?preview=1&t=' + Date.now(); break;

      /* products */
      case 'p-add': addProduct(); break;
      case 'p-edit': openEditor(i); break;
      case 'p-close': closeEditor(); break;
      case 'p-dup': T.update((x) => { const c = JSON.parse(JSON.stringify(x.products[i])); c.id = T.uid('p'); c.name += ' (COPY)'; c.createdAt = Date.now(); x.products.splice(i + 1, 0, c); }); $('#ptbody').innerHTML = productRows(); flashSaved(); break;
      case 'p-del':
        if (confirm('Hapus produk “' + d.products[i].name + '”?')) { closeEditor(); T.update((x) => x.products.splice(i, 1)); if (tab === 'products') $('#ptbody').innerHTML = productRows(); else render(); flashSaved(); }
        break;
      case 'img-del': T.update((x) => x.products[editing].images.splice(Number(el.dataset.k), 1)); openEditor(editing); flashSaved(); break;
      case 'img-main': T.update((x) => { const im = x.products[editing].images; im.unshift(im.splice(Number(el.dataset.k), 1)[0]); }); openEditor(editing); flashSaved(); break;
      case 'img-url': { const u = $('#imgUrl').value.trim(); if (!u) break; T.update((x) => x.products[editing].images.push(u)); openEditor(editing); flashSaved(); break; }

      /* categories */
      case 'c-add': {
        const n = $('#newCat').value.trim(); if (!n) { toast('Isi nama kategori'); break; }
        let id = slug(n); while (d.categories.some((c) => c.id === id)) id += '-' + Math.floor(Math.random() * 9);
        T.update((x) => x.categories.push({ id, name: n.toUpperCase(), visible: true })); render(); flashSaved(); break;
      }
      case 'c-up': T.update((x) => { x.categories.splice(i - 1, 0, x.categories.splice(i, 1)[0]); }); render(); flashSaved(); break;
      case 'c-dn': T.update((x) => { x.categories.splice(i + 1, 0, x.categories.splice(i, 1)[0]); }); render(); flashSaved(); break;
      case 'c-del': {
        const c = d.categories[i], used = d.products.filter((p) => p.category === c.id).length;
        if (confirm('Hapus kategori “' + c.name + '”?' + (used ? '\n' + used + ' produk akan menjadi tanpa kategori.' : ''))) {
          T.update((x) => { x.products.forEach((p) => { if (p.category === c.id) p.category = ''; }); x.categories.splice(i, 1); }); render(); flashSaved();
        }
        break;
      }

      /* appearance */
      case 'preset': T.update((x) => Object.assign(x.settings.theme, PRESETS[el.dataset.k])); render(); flashSaved(); break;

      /* features */
      case 'f-add': T.update((x) => x.settings.custom.flags.push({ key: 'flag' + (x.settings.custom.flags.length + 1), label: '', value: 'on' })); render(); flashSaved(); break;
      case 'f-del': T.update((x) => x.settings.custom.flags.splice(i, 1)); render(); flashSaved(); break;

      /* orders */
      case 'o-del': if (confirm('Hapus pesanan ini?')) { T.orders.remove(el.dataset.id); render(); } break;
      case 'o-clear': if (confirm('Hapus SEMUA pesanan?')) { T.orders.clear(); render(); } break;
      case 'o-csv': {
        const rows = [['id', 'waktu', 'status', 'total', 'item']].concat(T.orders.list().map((o) => [o.id, new Date(o.time).toISOString(), o.status, o.total, o.items.map((it) => `${it.name}${it.size ? ' [' + it.size + ']' : ''} x${it.qty}`).join(' | ')]));
        dl('trsh-orders.csv', rows.map((r) => r.map((c) => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n'), 'text/csv'); break;
      }
      case 's-csv': dl('trsh-subscribers.csv', 'email,waktu\n' + d.subscribers.map((s) => `${s.email},${new Date(s.time).toISOString()}`).join('\n'), 'text/csv'); break;

      /* system */
      case 'pw': {
        const v = $('#newPw').value;
        if (T.remote) {
          if (v.length < 8) { toast('Minimal 8 karakter'); break; }
          T.auth.changePassword(v).then(() => { $('#newPw').value = ''; toast('PASSWORD DIPERBARUI ✦'); }).catch((err) => toast('GAGAL: ' + ((err && err.message) || 'coba lagi')));
          break;
        }
        if (v.length < 4) { toast('Minimal 4 karakter'); break; } T.set('settings.admin.password', v); $('#newPw').value = ''; toast('PASSWORD DIPERBARUI ✦'); break; }
      case 'exp': dl('trsh-backup-' + new Date().toISOString().slice(0, 10) + '.json', T.exportJSON()); break;
      case 'reset': if (confirm('Reset semua produk, kategori, dan pengaturan ke default?')) { T.reset(); render(); toast('RESET SELESAI'); } break;
    }
  });

  function addProduct() {
    T.update((x) => x.products.unshift({
      id: T.uid('p'), name: 'PRODUK BARU', price: 100000, category: (x.categories[0] || {}).id || '', stock: 10,
      sizes: ['S', 'M', 'L', 'XL'], badge: 'NEW', desc: '', featured: false, active: true, images: [], createdAt: Date.now(),
    }));
    if (tab === 'products') $('#ptbody').innerHTML = productRows();
    openEditor(0);
  }

  /* ---------------- preview ---------------- */
  function togglePreview() {
    const on = document.body.classList.toggle('pv-on');
    const f = $('#pvFrame');
    if (on && f.getAttribute('src') === 'about:blank') f.src = 'index.html?preview=1';
  }

  /* ---------------- auth ---------------- */
  function enter() {
    $('#login').hidden = true; $('#app').hidden = false; render();
    const lv = $('.side-f .live'); if (lv) lv.innerHTML = '<span class="dot"></span> ' + (T.remote ? 'SUPABASE ☁ REALTIME' : 'MODE LOKAL (BELUM TERHUBUNG)');
  }
  if (T.remote) { $('#em').hidden = false; $('#em').required = true; $('#em').focus(); }
  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#loginErr');
    if (T.remote) {
      const btn = $('#loginForm button'); btn.disabled = true; err.hidden = true;
      try { await T.auth.signIn($('#em').value.trim(), $('#pw').value); enter(); }
      catch (x) {
        err.textContent = x.message === 'NOT_ADMIN' ? 'AKUN INI BUKAN ADMIN' : x.message === 'OFFLINE' ? 'TIDAK BISA TERHUBUNG KE SUPABASE' : 'EMAIL / PASSWORD SALAH';
        err.hidden = false; $('#pw').value = '';
      }
      btn.disabled = false; return;
    }
    if ($('#pw').value === S().admin.password) { sessionStorage.setItem('trsh_auth', '1'); enter(); }
    else { err.hidden = false; $('#pw').value = ''; }
  });
  if (T.remote) T.auth.init().then((ok) => { if (ok) enter(); });
  else if (sessionStorage.getItem('trsh_auth') === '1') enter();

  /* perubahan dari tab lain (pesanan baru, subscriber) */
  T.on((_, src) => {
    if (src !== 'remote' || $('#app').hidden) return;
    if (tab === 'dashboard' || tab === 'orders') render();
  });
})();
