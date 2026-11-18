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
    ['promo', 'Diskon & Promo', '%'], ['checkout', 'Checkout', '✉'], ['appearance', 'Tampilan', '◆'], ['content', 'Konten', '✎'],
    ['social', 'Sosial Media', '@'], ['features', 'Fitur & Toko', '⚙'], ['maintenance', 'Maintenance', '⚒'], ['advanced', 'Lanjutan', '⌥'],
    ['orders', 'Pesanan', '✦'], ['system', 'Sistem', '⌘'],
  ];
  let tab = sessionStorage.getItem('trsh_tab') || 'dashboard';
  let editing = -1;
  let pq = '';
  let ofilter = 'all';

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
  const fSub = (label, path, o = {}) => fText(label, path, o);
  const money = (n) => T.money(n);
  const priceLabel = (p) => { const x = T.pricing(p); return x.on ? `<b>${money(x.price)}</b> <s class="dim">${money(x.orig)}</s>` : money(p.price); };
  /* tanggal: tampil sebagai waktu lokal admin, disimpan sebagai ISO UTC (countdown sama untuk semua pengunjung) */
  const tzName = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } })();
  const isoToLocal = (v) => { if (!v) return ''; const d = new Date(v); if (isNaN(d)) return ''; return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
  const fDate = (label, path, o = {}) => `<div class="f"><span>${esc(label)}${o.req ? '' : ' (opsional)'}</span>
    <input type="datetime-local" data-type="date" ${o.req ? 'data-req="1"' : ''} data-path="${path}" value="${isoToLocal(val(path))}">
    <div class="dq"><button type="button" class="btn sm" data-a="d-set" data-path="${path}" data-add="0">SEKARANG</button><button type="button" class="btn sm" data-a="d-set" data-path="${path}" data-add="3600000">+1 JAM</button><button type="button" class="btn sm" data-a="d-set" data-path="${path}" data-add="86400000">+1 HARI</button><button type="button" class="btn sm" data-a="d-set" data-path="${path}" data-add="604800000">+7 HARI</button>${o.req ? '' : `<button type="button" class="btn sm danger" data-a="d-set" data-path="${path}" data-clear="1">KOSONGKAN</button>`}</div>
    ${tzName ? `<small class="dim mono">Zona waktu: ${esc(tzName)}</small>` : ''}</div>`;
  const fImage = (label, path, o = {}) => { const v = String(val(path) || ''); return `<div class="f"><span>${esc(label)}</span><div class="imgf">${v ? `<img src="${esc(v)}" alt="">` : '<i class="mono dim">kosong</i>'}<div class="imgf-c"><input type="text" class="inp" data-path="${path}" value="${esc(v.startsWith('data:') ? '' : v)}" placeholder="${v.startsWith('data:') ? '(gambar terupload)' : 'https://… atau upload'}"><div class="pre" style="gap:6px"><label class="btn sm" style="cursor:pointer">UPLOAD<input type="file" accept="image/*" hidden data-up="${path}" data-max="${o.max || 1600}" ${o.alpha ? 'data-alpha="1"' : ''}></label>${v ? `<button type="button" class="btn sm danger" data-a="img-clear" data-path="${path}">HAPUS</button>` : ''}</div></div></div></div>`; };
  // dialog konfirmasi sendiri (confirm() bawaan browser bisa diblokir & tampil jelek)
  function ask(msg, ok, danger) {
    return new Promise((res) => {
      const m = document.createElement('div'); m.className = 'dlg';
      m.innerHTML = `<div class="dlg-b" role="alertdialog" aria-modal="true"><p>${esc(msg).replace(/\n/g, '<br>')}</p><div class="dlg-a"><button class="btn" data-r="0">BATAL</button><button class="btn ${danger === false ? 'acc' : 'danger'}" data-r="1">${esc(ok || 'HAPUS')}</button></div></div>`;
      document.body.appendChild(m);
      const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      const done = (v) => { document.removeEventListener('keydown', key, true); m.remove(); res(v); };
      m.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) done(b.dataset.r === '1'); else if (e.target === m) done(false); });
      document.addEventListener('keydown', key, true);
      setTimeout(() => { const c = m.querySelector('[data-r="0"]'); if (c) c.focus(); }, 30);
    });
  }
  const fontOpts = () => T.customFontNames().map((n) => [n, '★ ' + n + ' (kustom)']).concat(T.FONTS.map((f) => [f.n, f.n]));

  /* ---------------- binding ---------------- */
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-path]')) {
      const t = el.dataset.type || 'str';
      let v;
      if (t === 'bool') v = el.checked;
      else if (t === 'num') v = el.value === '' ? 0 : Number(el.value);
      else if (t === 'list') v = el.value.split(',').map((s) => s.trim()).filter(Boolean);
      else if (t === 'date') {
        if (el.value === '') { if (el.dataset.req) return; v = ''; } // tanggal wajib: abaikan kondisi kosong saat sedang mengetik
        else { const d = new Date(el.value); if (isNaN(d)) return; v = d.toISOString(); }
      } else v = el.value;
      T.set(el.dataset.path, v);
      const o = el.parentElement && el.parentElement.querySelector('output'); if (o) o.textContent = v;
      if (editing >= 0) refreshSalePrev();
      if (el.dataset.rerender) { const pos = el.selectionStart; render(); const again = document.querySelector('[data-path="' + el.dataset.path + '"]'); if (again && pos != null && again.setSelectionRange) { again.focus(); try { again.setSelectionRange(pos, pos); } catch (x) {} } }
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
    const onSale = d.products.filter((p) => p.active !== false && T.pricing(p).on);
    const omzet = o.filter((x) => x.status !== 'cancel').reduce((a, x) => a + (Number(x.total) || 0), 0);
    const ps = T.promoState();
    return `<div class="stats">
      <div class="stat acc"><span class="mono dim">PRODUK AKTIF</span><b>${d.products.filter((p) => p.active !== false).length}<small class="dim" style="font-size:14px"> / ${d.products.length}</small></b></div>
      <div class="stat"><span class="mono dim">KATEGORI</span><b>${d.categories.length}</b></div>
      <div class="stat"><span class="mono dim">PRODUK DISKON</span><b>${onSale.length}</b>${ps.on ? '<span class="pill ok">PROMO GLOBAL AKTIF</span>' : ''}</div>
      <div class="stat"><span class="mono dim">PESANAN BARU</span><b>${o.filter((x) => x.status === 'new').length}</b></div>
      <div class="stat"><span class="mono dim">OMZET (TANPA BATAL)</span><b style="font-size:24px">${money(omzet)}</b></div>
      <div class="stat"><span class="mono dim">SUBSCRIBER</span><b>${d.subscribers.length}</b></div>
      <div class="stat"><span class="mono dim">PENYIMPANAN</span><b>${kb}<small class="dim" style="font-size:14px"> KB / ~5000</small></b></div></div>
    <div class="grid2">
      <div class="box"><h3>Aksi Cepat</h3>
        <div class="pre"><button class="btn acc" data-a="go-products-new">+ PRODUK BARU</button><button class="btn" data-a="go-promo">DISKON</button><button class="btn" data-a="go-categories">KATEGORI</button><button class="btn" data-a="go-appearance">TEMA</button><button class="btn" data-a="pv">LIVE PREVIEW</button></div>
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
        <span class="hid">${priceLabel(p)}${T.pricing(p).on ? ` <span class="pill ok">−${T.pricing(p).pct}%</span>` : ''}</span><span class="hid">${p.stock}</span>
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
        <div class="row2">${fNum('Harga normal', b + 'price', { min: 0 })}${fNum('Stok', b + 'stock', { min: 0 })}</div>
        <div class="box" style="padding:14px;gap:12px"><h3>Diskon & Harga Coret</h3>
          ${fTog('Aktifkan diskon produk ini', b + 'sale.on', 'Harga normal akan dicoret, harga diskon tampil menonjol')}
          <div class="row2">${fSelect('Jenis potongan', b + 'sale.type', [['percent', 'Persen (%)'], ['amount', 'Nominal (Rp)'], ['price', 'Harga akhir (Rp)']])}${fNum('Nilai', b + 'sale.value', { min: 0 })}</div>
          <div class="row2">${fDate('Mulai', b + 'sale.start')}${fDate('Berakhir', b + 'sale.end')}</div>
          <div class="sale-prev" id="salePrev"></div>
          <p class="hint dim" style="font-size:12px">Kosongkan jadwal agar diskon langsung & terus berlaku. Bila ada promo global aktif, harga termurah yang dipakai. Potongan yang tidak valid (≥ harga normal) diabaikan.</p></div>
        <div class="row2">${fSelect('Kategori', b + 'category', catOpts)}${fText('Badge (NEW / LIMITED …)', b + 'badge', { ph: 'opsional' })}</div>
        ${fText('SKU / kode produk (opsional)', b + 'sku', { ph: 'TRSH-001' })}
        <div class="box" style="padding:14px;gap:12px"><h3>Pre-order</h3>${fTog('Izinkan pre-order saat stok habis', b + 'preorder.on', 'Produk tetap bisa dipesan dengan badge PRE-ORDER')}<div class="row2">${fText('Estimasi tersedia', b + 'preorder.eta', { ph: 'cth: 20 Des 2026' })}${fNum('Kuota pre-order', b + 'preorder.limit', { min: 1 })}</div></div>
        <label class="f"><span>Ukuran (pisahkan dengan koma)</span><input type="text" data-type="list" data-path="${b}sizes" value="${esc((p.sizes || []).join(', '))}" placeholder="S, M, L, XL"></label>
        ${fArea('Deskripsi', b + 'desc', { rows: 4 })}
        <div class="row2">${fTog('Tampilkan di toko', b + 'active')}${fTog('Featured (urut paling atas)', b + 'featured')}</div>
        <div class="f"><span>Foto produk (foto pertama = utama, foto kedua tampil saat hover)</span>
          <div class="imgs">${imgs}</div>
          <label class="drop">+ UPLOAD FOTO (bisa banyak)<input type="file" id="fileIn" accept="image/*" multiple hidden></label>
          <div class="row2" style="grid-template-columns:1fr auto"><input class="inp" id="imgUrl" placeholder="atau tempel URL gambar https://…"><button class="btn" data-a="img-url">TAMBAH</button></div>
          <p class="hint dim" style="font-size:12px">Tanpa foto, toko memakai visual placeholder otomatis. ${T.remote ? 'Foto diupload ke Supabase Storage (maks ±1400px).' : 'Foto upload dikompres ke ±900px dan disimpan di browser.'}</p></div>
      </div>
      <div class="pn-f"><button class="btn danger" data-a="p-del" data-i="${i}">HAPUS PRODUK</button><button class="btn acc" data-a="p-close">SELESAI ✓</button></div>`;
  }
  const SALE0 = { on: false, type: 'percent', value: 0, start: '', end: '' };
  function refreshSalePrev() {
    const el = $('#salePrev'), p = db().products[editing];
    if (!el || !p) return;
    const x = T.pricing(p), sl = p.sale || {};
    let msg;
    if (x.on) msg = `<b>Harga tampil di toko:</b> ${money(x.price)} <s class="dim">${money(x.orig)}</s> <span class="pill ok">−${x.pct}% · hemat ${money(x.save)}</span>${x.src === 'promo' ? ' <span class="pill">dari promo global</span>' : ''}`;
    else if (sl.on) {
      const now = Date.now(), a = sl.start ? new Date(sl.start).getTime() : null, z = sl.end ? new Date(sl.end).getTime() : null;
      msg = a && now < a ? '⏳ Diskon belum dimulai — akan aktif otomatis sesuai jadwal.' : z && now > z ? '⌛ Diskon sudah berakhir.' : '⚠ Nilai diskon belum valid (harus > 0 dan menghasilkan harga di bawah harga normal).';
    } else msg = 'Diskon tidak aktif — harga normal ' + money(p.price) + '.';
    el.innerHTML = msg;
  }
  function openEditor(i) {
    const pp = db().products[i]; if (pp) { pp.sale = Object.assign({}, SALE0, pp.sale || {}); pp.preorder = Object.assign({ on: false, eta: '', limit: 5 }, pp.preorder || {}); }
    editing = i; $('#panel').innerHTML = editorHTML(i); refreshSalePrev();
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
      <div class="bar" style="margin:0"><input class="inp" id="newCat" placeholder="Nama kategori baru…"><button class="btn acc" data-a="c-add">+ TAMBAH KATEGORI</button></div></div>
      <div class="box wide"><h3>Size Guide per Kategori</h3><p class="hint">Tabel ukuran yang muncul lewat tombol “SIZE GUIDE” di halaman produk. Satu baris = satu baris tabel, kolom dipisah tanda <code>|</code>; baris pertama menjadi judul kolom. Kosongkan untuk menyembunyikan tombol.</p>
        ${cats.map((c, i) => fArea(c.name, `categories.${i}.sizeGuide`, { rows: 4, ph: 'UKURAN | LEBAR | PANJANG\nS | 52 | 68' })).join('')}</div></div>`;
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
      ${fontBox()}
      <div class="box"><h3>Layout Katalog</h3>${fSelect('Kolom grid (desktop)', 'settings.theme.gridCols', [[2, '2 kolom'], [3, '3 kolom'], [4, '4 kolom'], [5, '5 kolom']], true)}${fSelect('Rasio foto produk', 'settings.theme.ratio', [['4/5', '4:5 Portrait'], ['3/4', '3:4 Portrait'], ['1/1', '1:1 Square'], ['2/3', '2:3 Tall'], ['4/3', '4:3 Landscape']])}${fRange('Radius sudut (px)', 'settings.theme.radius', 0, 24, 1)}${fRange('Kecepatan animasi', 'settings.theme.animSpeed', 0.3, 2.5, 0.1)}</div>
      <div class="box"><h3>Gaya & Layout</h3>${fSelect('Bentuk tombol & chip', 'settings.theme.btnShape', [['sharp', 'Kotak (tajam)'], ['pill', 'Pil (bulat)']])}${fSelect('Gaya kartu produk', 'settings.theme.cardStyle', [['default', 'Default (foto + teks)'], ['bordered', 'Berbingkai'], ['flat', 'Flat tanpa garis']])}${fSelect('Penyesuaian foto', 'settings.theme.imgFit', [['cover', 'Isi penuh (crop)'], ['contain', 'Tampil utuh (tanpa crop)']])}${fNum('Lebar maksimum konten (px, 0 = penuh)', 'settings.theme.maxWidth', { min: 0, ph: '0' })}${fRange('Skala ukuran teks', 'settings.theme.fontScale', 0.85, 1.3, 0.05)}${fTog('Navbar menempel saat scroll', 'settings.theme.navSticky')}</div>
      <div class="box"><h3>Efek Kaca (Glass)</h3>${fTog('Aktifkan Glass UI', 'settings.theme.glass.on', 'Navbar, kartu, panel & tombol menjadi kaca transparan')}${fRange('Blur (px)', 'settings.theme.glass.blur', 0, 40, 1)}${fRange('Kepekatan kaca', 'settings.theme.glass.opacity', 0.1, 0.9, 0.05)}${fRange('Garis tepi kaca', 'settings.theme.glass.border', 0, 0.5, 0.02)}${fRange('Saturasi warna', 'settings.theme.glass.saturate', 1, 2.2, 0.1)}<div class="row2">${fTog('Navbar', 'settings.theme.glass.nav')}${fTog('Kartu produk', 'settings.theme.glass.cards')}</div><div class="row2">${fTog('Modal, keranjang, popup', 'settings.theme.glass.panels')}${fTog('Tombol, chip, input', 'settings.theme.glass.ui')}</div><p class="hint">Kaca paling terlihat di atas latar bergerak — nyalakan efek <b>Aurora</b> pada kotak Efek Visual.</p></div>
      <div class="box"><h3>Gaya UI Lanjutan</h3>${fSelect('Kepadatan jarak seksi', 'settings.theme.density', [['compact', 'Rapat'], ['normal', 'Normal'], ['airy', 'Lega']])}${fRange('Intensitas bayangan', 'settings.theme.shadow', 0, 1, 0.05)}${fSelect('Gaya tombol', 'settings.theme.btnStyle', [['outline', 'Garis (hover isi)'], ['solid', 'Solid'], ['gradient', 'Gradien aksen']])}${fColor('Warna aksen kedua (gradien & aurora)', 'settings.theme.accent2')}${fTog('Efek logam “chrome” pada judul', 'settings.theme.chromeText')}${fSelect('Pola latar hero', 'settings.theme.bgPattern', [['grid', 'Grid'], ['dots', 'Titik'], ['none', 'Polos']])}${fSelect('Gaya kursor kustom', 'settings.theme.cursorStyle', [['ring', 'Cincin'], ['dot', 'Titik'], ['cross', 'Crosshair']])}${fSelect('Gaya loading awal', 'settings.theme.loaderStyle', [['counter', 'Angka 000–100'], ['minimal', 'Logo berdenyut'], ['curtain', 'Tirai terbuka']])}</div>
      <div class="box"><h3>Tema Terang (tombol ☀/☾ pengunjung)</h3>${fTog('Beri pengunjung tombol ganti tema', 'settings.store.themeToggle', 'Tombol di navbar; pilihan diingat per pengunjung')}${fColor('Background (terang)', 'settings.theme.alt.bg')}${fColor('Teks (terang)', 'settings.theme.alt.fg')}${fColor('Teks redup (terang)', 'settings.theme.alt.muted')}${fColor('Kartu (terang)', 'settings.theme.alt.card')}${fColor('Garis (terang)', 'settings.theme.alt.line')}${fColor('Aksen (terang) — kosong = otomatis digelapkan', 'settings.theme.alt.accent')}<button class="btn sm" data-a="alt-acc-clear">AKSEN TERANG: OTOMATIS</button></div>
      <div class="box"><h3>Animasi</h3>${fSelect('Gaya muncul saat di-scroll', 'settings.theme.revealStyle', [['up', 'Naik + fade'], ['fade', 'Fade'], ['zoom', 'Zoom'], ['slide', 'Geser'], ['blur', 'Blur ke tajam']])}${fSelect('Efek hover kartu produk', 'settings.theme.cardHover', [['lift', 'Terangkat'], ['zoom', 'Zoom foto'], ['glow', 'Glow aksen'], ['none', 'Tanpa efek']])}<p class="hint">Kecepatan semua animasi diatur di kotak “Layout Katalog” (Kecepatan animasi). Pengunjung dengan pengaturan “kurangi gerakan” otomatis tidak melihat animasi.</p></div>
      <div class="box"><h3>Efek Visual</h3>${fTog('Preloader', 'settings.effects.preloader', 'Animasi loading saat membuka toko')}${fTog('Film grain', 'settings.effects.grain', 'Tekstur noise halus')}${fTog('Scanlines', 'settings.effects.scanlines', 'Garis CRT ala Y2K')}${fTog('Custom cursor', 'settings.effects.cursor', 'Hanya perangkat mouse')}${fTog('Reveal saat scroll', 'settings.effects.reveal')}${fTog('Glitch judul (hover)', 'settings.effects.glitch')}${fTog('Tilt 3D kartu produk', 'settings.effects.tilt')}${fTog('Sparkle & ring hero', 'settings.effects.sparkles')}${fTog('Foto kedua saat hover kartu', 'settings.effects.hoverSwap')}${fTog('Progress bar scroll', 'settings.effects.progress')}${fTog('Smooth scroll', 'settings.effects.smooth')}${fTog('Tombol kembali ke atas', 'settings.effects.backTop')}${fTog('Aurora (latar gradien bergerak)', 'settings.effects.aurora')}${fTog('Parallax hero saat scroll', 'settings.effects.parallax')}${fTog('Animasi intro judul hero', 'settings.effects.heroIntro')}${fTog('Foto produk fade-in + shimmer', 'settings.effects.imgFade')}${fTog('Tombol BAG “membal” saat tambah item', 'settings.effects.bump')}${fTog('Marquee berhenti saat di-hover', 'settings.effects.marqueePause')}${fTog('Foto “terbang” ke keranjang', 'settings.effects.flyToCart')}${fTog('Ledakan ♥ saat wishlist', 'settings.effects.heartBurst')}${fTog('Tombol magnetik (ikut kursor)', 'settings.effects.magnetic')}${fTog('Judul hero “decode” saat dibuka', 'settings.effects.scramble')}${fTog('Judul seksi wipe saat muncul', 'settings.effects.splitReveal')}${fTog('Efek riak pada tombol', 'settings.effects.ripple')}${fTog('Marquee miring mengikuti scroll', 'settings.effects.marqueeSkew')}</div></div>`;
  }

  function vContent() {
    return `<div class="grid2">
      <div class="box"><h3>Brand</h3>${fText('Nama singkat (logo)', 'settings.brand.name')}${fText('Nama lengkap (wordmark footer)', 'settings.brand.fullName')}${fText('Tagline', 'settings.brand.tagline')}${fSelect('Tampilan logo di navbar', 'settings.brand.logoMode', [['text', 'Teks saja'], ['image', 'Gambar saja'], ['both', 'Gambar + teks']])}${fImage('Logo (PNG/SVG transparan)', 'settings.brand.logoImage', { max: 600, alpha: true })}${fNum('Tinggi logo (px)', 'settings.brand.logoHeight', { min: 12 })}</div>
      <div class="box"><h3>Hero</h3>${fText('Eyebrow', 'settings.hero.eyebrow')}<div class="row2">${fText('Judul baris 1', 'settings.hero.line1')}${fText('Judul baris 2 (chrome)', 'settings.hero.line2')}</div>${fArea('Sub-teks', 'settings.hero.sub', { rows: 3 })}<div class="row2">${fText('Teks tombol', 'settings.hero.cta')}${fText('Link tombol', 'settings.hero.ctaLink')}</div>${fTog('Tampilkan sticker berputar', 'settings.hero.showSticker')}${fText('Teks sticker', 'settings.hero.sticker')}
        <div class="row2">${fSelect('Tinggi hero', 'settings.hero.size', [['full', 'Layar penuh'], ['tall', 'Tinggi'], ['compact', 'Ringkas']])}${fSelect('Rata teks', 'settings.hero.align', [['left', 'Kiri'], ['center', 'Tengah']])}</div>
        ${fImage('Gambar latar hero (opsional)', 'settings.hero.bgImage', { max: 1920 })}${fRange('Gelapkan gambar latar', 'settings.hero.bgOverlay', 0, 0.95, 0.05)}
        ${fTog('Ilustrasi bintang animasi', 'settings.hero.showArt')}${fTog('Baris meta bawah (N°001 / SCROLL / tahun)', 'settings.hero.showMeta')}<div class="row3">${fText('Meta kiri', 'settings.hero.metaLeft')}${fText('Meta tengah', 'settings.hero.metaCenter')}${fText('Meta kanan (kosong = tahun)', 'settings.hero.metaRight')}</div></div>
      <div class="box"><h3>Announcement & Marquee</h3>${fTog('Tampilkan announcement bar', 'settings.announcement.enabled')}${fText('Teks announcement', 'settings.announcement.text')}<div class="row2">${fText('Link (opsional)', 'settings.announcement.link', { ph: '#shop atau https://…' })}${fSelect('Gaya warna', 'settings.announcement.style', [['accent', 'Aksen'], ['dark', 'Gelap'], ['alert', 'Merah (promo)']])}</div>${fTog('Bisa ditutup pengunjung (✕)', 'settings.announcement.dismissible')}${fText('Teks marquee (berjalan)', 'settings.marquee.text')}${fRange('Durasi marquee (detik, makin kecil makin cepat)', 'settings.marquee.speed', 8, 80, 1)}</div>
      <div class="box"><h3>Drop Countdown</h3>${fText('Judul', 'settings.drop.title')}${fText('Kicker (teks kecil di atas judul)', 'settings.drop.kicker', { ph: '[ 01 — NEXT DROP IN ]' })}${fText('Catatan', 'settings.drop.note')}${fDate('Tanggal & waktu drop', 'settings.drop.date', { req: true })}<p class="hint">Setelah waktunya lewat, hitung mundur menampilkan 00 berwarna aksen (LIVE).</p></div>
      <div class="box"><h3>Katalog</h3>${fText('Kicker', 'settings.shop.kicker')}${fText('Judul seksi', 'settings.shop.title')}</div>
      <div class="box"><h3>About / Manifesto</h3>${fText('Kicker', 'settings.about.kicker')}${fArea('Judul (Enter = baris baru)', 'settings.about.title', { rows: 2 })}${fArea('Teks', 'settings.about.text', { rows: 5 })}</div>
      <div class="box"><h3>Newsletter & Footer</h3>${fText('Judul newsletter', 'settings.footer.newsletterTitle')}${fText('Teks newsletter', 'settings.footer.newsletterText')}${fText('Teks footer', 'settings.footer.text')}${fText('Kicker newsletter', 'settings.footer.newsletterKicker')}${fTog('Tulisan raksasa di footer', 'settings.footer.showWordmark')}${fText('Teks tulisan raksasa (kosong = nama lengkap)', 'settings.footer.wordmark')}${fTog('Link BACK TO TOP', 'settings.footer.showBackTop')}</div>
      <div class="box"><h3>Sosial Media</h3><p class="hint">Pengaturan ${T.socialLinks().length} link aktif — nyalakan/matikan tiap platform (Instagram, TikTok, WhatsApp, YouTube, dll) di tab khusus.</p><button class="btn acc" data-a="go-social">BUKA SOSIAL MEDIA →</button></div></div>`;
  }

  function vFeatures() {
    const fl = S().custom.flags || [];
    return `<div class="grid2">
      <div class="box"><h3>Seksi Halaman</h3>${fTog('Hero', 'settings.sections.hero')}${fTog('Marquee', 'settings.sections.marquee')}${fTog('Drop countdown', 'settings.sections.drop')}${fTog('Katalog produk', 'settings.sections.shop')}${fTog('Blok HTML tambahan', 'settings.sections.extra', 'Isi di bagian “Blok HTML” di bawah')}${fTog('About / Manifesto', 'settings.sections.about')}${fTog('Newsletter', 'settings.sections.newsletter')}</div>
      <div class="box"><h3>Fitur Toko</h3>${fTog('Keranjang & checkout', 'settings.store.cart')}${fTog('Wishlist (♡ saved)', 'settings.store.wishlist')}${fTog('Pencarian', 'settings.store.search')}${fTog('Urutkan', 'settings.store.sort')}${fTog('Tampilkan info stok', 'settings.store.showStock')}${fNum('Batas “stok menipis”', 'settings.store.lowStock', { min: 0 })}${fTog('Mode maintenance', 'settings.store.maintenance')}${fText('Pesan maintenance', 'settings.store.maintenanceText')}</div>
      <div class="box"><h3>Katalog Lanjutan</h3>${fSelect('Urutan default', 'settings.store.defaultSort', [['new', 'Terbaru (featured dulu)'], ['low', 'Harga termurah'], ['high', 'Harga termahal'], ['az', 'A — Z']])}${fSelect('Produk habis (stok 0)', 'settings.store.soldOut', [['show', 'Tampilkan (abu-abu, SOLD OUT)'], ['last', 'Tampilkan di urutan paling akhir'], ['hide', 'Sembunyikan']])}${fNum('Produk per halaman (0 = semua, tombol LOAD MORE)', 'settings.store.perPage', { min: 0 })}${fNum('Maks. qty per produk per order (0 = bebas)', 'settings.store.maxPerItem', { min: 0 })}</div>
      <div class="box"><h3>Buka / Tutup Order</h3>${fTog('Terima pesanan (checkout aktif)', 'settings.store.ordering', 'Matikan untuk menutup checkout sementara — katalog tetap tampil')}${fText('Pesan saat order ditutup', 'settings.store.closedText')}</div>
      <div class="box"><h3>Ongkir & Minimum Order</h3>${fNum('Ongkir flat (0 = tidak ditampilkan)', 'settings.store.shipFee', { min: 0 })}${fNum('Gratis ongkir untuk belanja ≥ (0 = nonaktif)', 'settings.store.freeShipMin', { min: 0 })}${fNum('Minimum order (0 = bebas)', 'settings.store.minOrder', { min: 0 })}${fText('Catatan pengiriman (di keranjang)', 'settings.store.shipNote', { ph: 'cth: Dikirim 1–2 hari kerja' })}${fTog('Kolom kode voucher di keranjang', 'settings.store.voucherBox')}</div>
      <div class="box"><h3>Mata Uang & Checkout</h3>${fText('Simbol mata uang', 'settings.store.currency')}<p class="hint">Channel (WhatsApp, email, dll), data pembeli, template pesan & gambar struk diatur di tab <b>Checkout</b>.</p><button class="btn acc" data-a="go-checkout">BUKA TAB CHECKOUT →</button></div>
      <div class="box"><h3>Fitur Tambahan Toko</h3>${fTog('Link langsung ke produk (#p-id)', 'settings.store.deepLinks', 'Pengunjung bisa membuka & membagikan link produk')}${fTog('Tombol share di produk', 'settings.store.share')}${fTog('Zoom foto (lightbox)', 'settings.store.lightbox')}${fTog('Produk terkait di modal', 'settings.store.related')}${fTog('Bagian “Terakhir dilihat”', 'settings.store.recent')}</div>
      <div class="box"><h3>Tombol WhatsApp Melayang</h3>${fTog('Tampilkan tombol chat WhatsApp', 'settings.store.waFloat')}${fText('Teks tombol', 'settings.store.waFloatText')}${fSelect('Posisi', 'settings.store.waFloatPos', [['right', 'Kanan bawah'], ['left', 'Kiri bawah']])}${fText('Pesan awal', 'settings.store.waFloatMsg')}</div>
      <div class="box"><h3>Fitur Kustom (flag) <button class="btn sm" data-a="f-add">+ TAMBAH</button></h3>
        <p class="hint">Tambah setting bebas. Tiap flag otomatis menjadi atribut <code>body[data-f-key="value"]</code> dan variabel CSS <code>--c-key</code> di toko — bisa dipakai di Custom CSS untuk menyalakan/mematikan gaya apa pun secara realtime.</p>
        ${fl.length ? fl.map((f, i) => `<div class="frow">${fText('Key', `settings.custom.flags.${i}.key`, { ph: 'promo' })}${fText('Label', `settings.custom.flags.${i}.label`, { ph: 'Mode promo' })}${fText('Value', `settings.custom.flags.${i}.value`, { ph: 'on' })}<button class="btn sm danger" data-a="f-del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada flag.</p>'}</div>
      <div class="box wide"><h3>Custom CSS</h3><p class="hint">Contoh: <code>body[data-f-promo="on"] .badge.hot{background:#ff2a3d}</code></p>${fArea('CSS tambahan (diterapkan langsung)', 'settings.custom.css', { code: true })}</div>
      <div class="box wide"><h3>Blok HTML Tambahan</h3><p class="hint">Disisipkan sebagai seksi di antara katalog dan about (aktifkan di “Seksi Halaman”). Gunakan untuk banner, lookbook, FAQ, dll.</p>${fArea('HTML', 'settings.custom.extraHtml', { code: true })}</div></div>`;
  }


  /* ---------------- Diskon & Promo ---------------- */
  function vPromo() {
    const pr = S().promo, cats = db().categories, vs = S().vouchers || [];
    const sale = db().products.filter((p) => p.active !== false && T.pricing(p).on);
    const ps = T.promoState();
    const scope = `<label class="f"><span>Berlaku untuk</span><select data-path="settings.promo.scope" data-rerender="1"><option value="all" ${pr.scope !== 'cats' ? 'selected' : ''}>Semua produk</option><option value="cats" ${pr.scope === 'cats' ? 'selected' : ''}>Kategori tertentu</option></select></label>`;
    const catList = pr.scope === 'cats' ? `<div class="pre">${cats.map((c) => `<button class="sw ${(pr.cats || []).indexOf(c.id) >= 0 ? 'on' : ''}" data-a="promo-cat" data-id="${esc(c.id)}">${(pr.cats || []).indexOf(c.id) >= 0 ? '✓ ' : ''}${esc(c.name)}</button>`).join('')}</div>${(pr.cats || []).length ? '' : '<p class="hint err">Pilih minimal satu kategori.</p>'}` : '';
    const vrows = vs.length ? vs.map((v, i) => `<div class="vrow2">
        ${fText('Kode', `settings.vouchers.${i}.code`, { ph: 'TRSH10' })}${fSelect('Jenis', `settings.vouchers.${i}.type`, [['percent', 'Persen (%)'], ['amount', 'Nominal (Rp)'], ['ship', 'Gratis ongkir']])}
        ${fNum('Nilai', `settings.vouchers.${i}.value`, { min: 0 })}${fNum('Min. belanja', `settings.vouchers.${i}.minSpend`, { min: 0 })}${fNum('Maks. potongan (Rp, untuk %)', `settings.vouchers.${i}.maxDiscount`, { min: 0 })}
        ${fDate('Kedaluwarsa', `settings.vouchers.${i}.expires`)}
        ${fTog('Aktif', `settings.vouchers.${i}.active`)}<button class="btn sm danger" data-a="v-del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada voucher.</p>';
    return `<div class="grid2">
      <div class="box wide"><h3>Promo Global / Flash Sale ${ps.on ? '<span class="pill ok">SEDANG AKTIF</span>' : '<span class="pill">TIDAK AKTIF</span>'}</h3>
        <p class="hint">Diskon otomatis untuk semua produk atau kategori tertentu, tanpa edit satu per satu. Jika sebuah produk juga punya diskon sendiri, harga <b>termurah</b> yang dipakai. Jadwal mulai/berakhir diterapkan otomatis (harga di toko berubah sendiri, tanpa reload).</p>
        ${fTog('Aktifkan promo global', 'settings.promo.enabled')}
        <div class="row3">${fText('Label', 'settings.promo.label', { ph: 'FLASH SALE' })}${fSelect('Jenis potongan', 'settings.promo.type', [['percent', 'Persen (%)'], ['amount', 'Nominal (Rp)']])}${fNum('Nilai', 'settings.promo.value', { min: 0 })}</div>
        <div class="row2">${fDate('Mulai', 'settings.promo.start')}${fDate('Berakhir', 'settings.promo.end')}</div>
        ${scope}${catList}
        ${fTog('Banner promo + countdown di atas toko', 'settings.promo.banner')}${fText('Teks tambahan banner', 'settings.promo.bannerText')}</div>
      <div class="box"><h3>Tampilan Harga Diskon</h3>${fTog('Tampilkan harga coret', 'settings.store.showStrike', 'Harga normal dicoret di samping harga diskon')}${fTog('Tampilkan “HEMAT Rp …”', 'settings.store.showSavings')}${fSelect('Badge diskon di kartu', 'settings.store.discountBadge', [['percent', 'Persen (−30%)'], ['amount', 'Nominal (−Rp 50.000)'], ['label', 'Teks SALE'], ['none', 'Tanpa badge']])}${fTog('Chip filter “✦ SALE”', 'settings.store.saleChip')}${fSelect('Pembulatan harga diskon (%/nominal)', 'settings.store.roundTo', [[0, 'Tanpa pembulatan'], [100, 'Ke Rp 100 terdekat'], [500, 'Ke Rp 500 terdekat'], [1000, 'Ke Rp 1.000 terdekat']], true)}</div>
      <div class="box"><h3>Produk Sedang Diskon (${sale.length})</h3>${sale.length ? sale.map((p) => { const x = T.pricing(p); return `<div class="tg" style="cursor:default"><span><b>${esc(p.name)}</b><small>${money(x.price)} <s>${money(x.orig)}</s> · ${x.src === 'promo' ? 'promo global' : 'diskon produk'}${x.end ? ' · s/d ' + new Date(x.end).toLocaleString('id-ID') : ''}</small></span><span class="pill ok">−${x.pct}%</span></div>`; }).join('') : '<p class="hint">Belum ada produk berdiskon. Atur diskon per produk di tab Produk → Edit, atau aktifkan promo global.</p>'}</div>
      <div class="box wide"><h3>Kode Voucher <button class="btn sm" data-a="v-add">+ TAMBAH</button></h3>
        <p class="hint">Pembeli memasukkan kode di keranjang. Potongan dihitung dari subtotal setelah diskon produk. Catatan: daftar voucher ikut tersimpan di pengaturan toko yang bersifat publik — jangan jadikan kode ini rahasia.</p>${vrows}</div>
      <div class="box wide"><h3>Popup Promo <button class="btn sm acc" data-a="pp-test">▶ TES POPUP DI PREVIEW</button></h3><p class="hint">Popup sambutan/promo. Kode di popup bisa diklik pembeli untuk otomatis terpasang di keranjang. Jika isi popup kamu ubah, pengunjung lama akan melihatnya lagi.</p>
        ${fTog('Aktifkan popup', 'settings.popup.enabled')}<div class="row2">${fText('Judul', 'settings.popup.title')}${fText('Kode voucher (opsional)', 'settings.popup.code', { ph: 'TRSH10' })}</div>${fArea('Teks', 'settings.popup.text', { rows: 2 })}${fImage('Gambar popup (opsional)', 'settings.popup.image', { max: 1000, alpha: true })}
        <div class="row3">${fText('Teks tombol', 'settings.popup.cta')}${fText('Link tombol', 'settings.popup.link')}${fText('Teks tutup', 'settings.popup.closeText')}</div>
        <div class="row3">${fSelect('Muncul saat', 'settings.popup.trigger', [['delay', 'Setelah jeda waktu'], ['scroll', 'Setelah scroll'], ['exit', 'Kursor keluar halaman (desktop)']])}${fNum('Jeda (detik)', 'settings.popup.delay', { min: 0 })}${fNum('Scroll (% halaman)', 'settings.popup.scrollPct', { min: 5 })}</div>
        <div class="row3">${fSelect('Posisi', 'settings.popup.position', [['center', 'Tengah (modal)'], ['corner', 'Pojok kanan bawah'], ['bar', 'Bar bawah']])}${fSelect('Frekuensi tampil', 'settings.popup.frequency', [['session', 'Sekali per sesi browser'], ['once', 'Sekali saja per pengunjung'], ['always', 'Setiap kali toko dibuka']])}${fTog('Tampil di HP', 'settings.popup.mobile')}</div></div></div>`;
  }

  /* ---------------- Sosial Media ---------------- */
  function vSocial() {
    const on = S().socialOn || {}, extra = S().socialExtra || [], act = T.socialLinks();
    const rows = T.SOCIALS.map((d) => {
      const v = (S().social || {})[d.k] || '', href = T.socialHref(d.k, v);
      const st = !v ? '' : href ? '<span class="pill ok">URL OK</span>' : '<span class="pill no">TIDAK VALID</span>';
      return `<div class="soc"><label class="tg"><span><b>${esc(d.n)}</b></span><input type="checkbox" data-type="bool" data-path="settings.socialOn.${d.k}" ${on[d.k] ? 'checked' : ''}><i></i></label>
        <input class="inp" data-path="settings.social.${d.k}" value="${esc(v)}" placeholder="${esc(d.ph)}" spellcheck="false">${st || '<span></span>'}</div>`;
    }).join('');
    const exRows = extra.length ? extra.map((x, i) => `<div class="soc ex"><label class="tg"><span><b>Tampil</b></span><input type="checkbox" data-type="bool" data-path="settings.socialExtra.${i}.on" ${x.on !== false ? 'checked' : ''}><i></i></label>
        <input class="inp" data-path="settings.socialExtra.${i}.label" value="${esc(x.label || '')}" placeholder="Label (cth: LINKTREE)"><input class="inp" data-path="settings.socialExtra.${i}.url" value="${esc(x.url || '')}" placeholder="https://…"><button class="btn sm danger" data-a="soc-del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada link kustom.</p>';
    return `<div class="grid2">
      <div class="box wide"><h3>Pengaturan Tampil</h3>
        <div class="row3">${fTog('Tampilkan di footer', 'settings.socialCfg.footer')}${fTog('Tampilkan di hero', 'settings.socialCfg.hero')}${fTog('Buka di tab baru', 'settings.socialCfg.newTab')}</div>
        <p class="hint">Aktif di toko sekarang (${act.length}): ${act.length ? act.map((l) => esc(l.label)).join(' · ') : '<i>tidak ada</i>'}. Platform dengan toggle mati — atau URL kosong/tidak valid — otomatis <b>disembunyikan</b>. Bisa isi lengkap URL, atau cukup username (cth: <code>@rude.trash</code>) / nomor WhatsApp.</p>
        <div class="pre"><button class="btn" data-a="soc-all-on">AKTIFKAN SEMUA YANG TERISI</button><button class="btn danger" data-a="soc-all-off">MATIKAN SEMUA</button></div></div>
      <div class="box wide"><h3>Platform</h3><div class="soc-list">${rows}</div></div>
      <div class="box wide"><h3>Link Kustom <button class="btn sm" data-a="soc-add">+ TAMBAH</button></h3><p class="hint">Untuk Linktree, website, marketplace lain, dsb.</p>${exRows}</div></div>`;
  }

  /* ---------------- Lanjutan: urutan seksi, SEO, tracking, label ---------------- */
  const SEC_NAMES = { hero: 'Hero', marquee: 'Marquee', drop: 'Drop countdown', shop: 'Katalog produk', extra: 'Blok HTML tambahan', about: 'About / Manifesto', newsletter: 'Newsletter' };
  const LABEL_NAMES = { navShop: 'Menu: katalog', navDrop: 'Menu: drop', navAbout: 'Menu: about', navJoin: 'Menu: join', bag: 'Tombol keranjang', search: 'Label cari', searchPh: 'Placeholder cari', all: 'Chip semua', saved: 'Chip saved', sale: 'Chip/badge sale', newest: 'Sort: terbaru', priceLow: 'Sort: termurah', priceHigh: 'Sort: termahal', az: 'Sort: A-Z', addToBag: 'Tombol tambah', soldOut: 'Teks habis', inStock: 'Teks tersedia', onlyLeft: 'Sisa stok ({n})', size: 'Label ukuran', qty: 'Label qty', yourBag: 'Judul keranjang', bagEmpty: 'Keranjang kosong', remove: 'Hapus item', subtotal: 'Subtotal', total: 'Total', shipping: 'Ongkir', free: 'Gratis', youSave: 'Hemat', checkout: 'Tombol checkout', loadMore: 'Load more', noResult: 'Tidak ada hasil', voucher: 'Placeholder voucher', apply: 'Tombol pakai', subscribe: 'Tombol subscribe', emailPh: 'Placeholder email', added: 'Toast tambah', menu: 'Menu mobile', scroll: 'Hero: teks scroll', backTop: 'Footer: back to top', days: 'Countdown: hari', hrs: 'Countdown: jam', min: 'Countdown: menit', sec: 'Countdown: detik', usecode: 'Popup: pakai kode', preorder: 'Badge pre-order', share: 'Tombol share', sizeGuide: 'Tombol size guide', related: 'Judul produk terkait', recent: 'Judul terakhir dilihat', copied: 'Toast link disalin', checkoutVia: 'Tombol checkout ({ch})', chooseChannel: 'Judul pilih channel', name: 'Form: nama', phone: 'Form: no. HP', address: 'Form: alamat', note: 'Form: catatan', theme: 'Tombol tema', zoom: 'Tooltip zoom', eta: 'Estimasi pre-order', fillName: 'Peringatan nama', fillPhone: 'Peringatan no. HP', fillAddress: 'Peringatan alamat' };
  function vAdvanced() {
    const order = T.sectionOrder();
    const sec = order.map((k, i) => `<div class="crow" style="grid-template-columns:28px 1fr auto auto"><span class="mono dim">${i + 1}</span><b>${esc(SEC_NAMES[k])}</b><span class="pill ${S().sections[k] ? 'ok' : 'no'}">${S().sections[k] ? 'TAMPIL' : 'MATI'}</span><div class="acts" style="display:flex;gap:6px"><button class="btn sm" data-a="sec-up" data-i="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn sm" data-a="sec-dn" data-i="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('');
    const labels = Object.keys(T.LABELS).map((k) => `<label class="f"><span>${esc(LABEL_NAMES[k] || k)}</span><input type="text" data-path="settings.labels.${k}" value="${esc(S().labels && S().labels[k] != null ? S().labels[k] : T.LABELS[k])}"></label>`).join('');
    return `<div class="grid2">
      <div class="box"><h3>Urutan Seksi Halaman</h3><p class="hint">Atur urut tampil dari atas ke bawah. Menu navbar mengikuti urutan ini. (Nyala/matinya seksi diatur di Fitur & Toko.)</p><div class="tbl">${sec}</div></div>
      <div class="box"><h3>SEO & Berbagi Link</h3>${fText('Judul halaman (kosong = otomatis)', 'settings.seo.title')}${fArea('Deskripsi (meta description)', 'settings.seo.description', { rows: 3, ph: 'Ringkasan toko untuk Google / preview WhatsApp' })}${fText('Gambar preview (URL, 1200×630)', 'settings.seo.image', { type: 'url', ph: 'https://…/og.jpg' })}${fText('Favicon (emoji / URL gambar)', 'settings.seo.favicon', { ph: '✦' })}${fSelect('Bahasa halaman', 'settings.seo.lang', [['id', 'Indonesia'], ['en', 'English']])}<p class="hint">Preview link di WhatsApp/Google umumnya membaca tag dari file <code>index.html</code>, bukan hasil JavaScript — untuk gambar preview di sosial media, isi juga meta <code>og:image</code> di index.html.</p></div>
      <div class="box"><h3>Analytics & Pixel</h3>${fText('Google Analytics 4 (Measurement ID)', 'settings.tracking.ga', { ph: 'G-XXXXXXXXXX' })}${fText('Meta Pixel ID', 'settings.tracking.pixel', { ph: '1234567890123456' })}<p class="hint">Hanya dimuat di toko publik (bukan preview/admin). Event add-to-cart & checkout ikut terkirim. Pastikan sesuai kebijakan privasi/persetujuan cookie di wilayahmu.</p></div>
      <div class="box wide"><h3>Teks & Label Toko <button class="btn sm" data-a="lbl-reset">RESET KE DEFAULT</button></h3><p class="hint">Ganti semua teks antarmuka toko (tombol, menu, keranjang) — cocok untuk bahasa Indonesia penuh atau gaya brand sendiri. Kosongkan untuk memakai teks default. <code>{n}</code> = jumlah.</p><div class="row3">${labels}</div></div></div>`;
  }


  /* ---------------- Checkout (WhatsApp, email, dll) ---------------- */
  function vCheckout() {
    const ck = S().store.checkout, on = ck.channels || {}, act = T.channelList();
    const rows = T.CHANNELS.map((d) => {
      const wa = d.k === 'whatsapp', path = wa ? 'settings.store.whatsapp' : 'settings.store.checkout.' + d.k, v = wa ? S().store.whatsapp : ck[d.k];
      const st = v ? (T.chanOk(d.k) ? '<span class="pill ok">VALID</span>' : '<span class="pill no">TIDAK VALID</span>') : '';
      return `<div class="soc"><label class="tg"><span><b>${d.i} ${esc(d.n)}</b></span><input type="checkbox" data-type="bool" data-path="settings.store.checkout.channels.${d.k}" ${on[d.k] ? 'checked' : ''}><i></i></label>
        <input class="inp" data-path="${path}" value="${esc(v || '')}" placeholder="${esc(d.ph)}" spellcheck="false">${st || '<span></span>'}</div>`;
    }).join('');
    return `<div class="grid2">
      <div class="box wide"><h3>Channel Checkout</h3>
        <p class="hint">Nyalakan channel yang ingin kamu pakai. Pembeli memilih sendiri lewat tombol di keranjang (jika hanya satu aktif, langsung satu tombol). Aktif di toko sekarang (${act.length}): ${act.length ? act.map((c) => esc(c.n)).join(' · ') : '<b>tidak ada — pembeli tidak bisa checkout</b>'}.</p>
        <div class="soc-list">${rows}</div>
        <p class="hint dim">WhatsApp, Email, LINE & SMS membuka pesan yang sudah terisi. Telegram, Instagram DM & Messenger tidak mendukung isi otomatis, jadi pesan disalin ke clipboard lalu chat dibuka (pembeli tinggal tempel).</p></div>
      <div class="box"><h3>Gambar Produk di Pesanan</h3>
        ${fSelect('Lampirkan gambar produk', 'settings.store.checkout.image', [['off', 'Tidak (teks saja)'], ['links', 'Link foto produk di dalam pesan'], ['receipt', 'Gambar struk (dibagikan / diunduh)'], ['both', 'Link + gambar struk (disarankan)']])}
        <p class="hint">Link WhatsApp/email tidak bisa melampirkan file otomatis. Solusinya: setelah checkout, pembeli melihat <b>gambar struk</b> (foto produk, harga, diskon, total, data pembeli) yang bisa <b>dibagikan langsung (HP)</b> atau diunduh lalu dilampirkan di chat. Opsi “link” menaruh URL foto di pesan (hanya bila foto berupa URL, mis. Supabase Storage).</p>
        ${fTog('Konfeti saat checkout berhasil', 'settings.store.checkout.confetti')}${fText('Catatan di bawah struk', 'settings.store.checkout.receiptNote')}</div>
      <div class="box"><h3>Data Pembeli</h3><p class="hint">Kolom yang tampil di keranjang sebelum checkout. Isinya masuk ke pesan, struk, dan catatan pesanan.</p>
        <div class="row2">${fTog('Nama', 'settings.store.checkout.askName')}${fTog('Wajib', 'settings.store.checkout.requireName')}</div>
        <div class="row2">${fTog('No. HP', 'settings.store.checkout.askPhone')}${fTog('Wajib', 'settings.store.checkout.requirePhone')}</div>
        <div class="row2">${fTog('Alamat', 'settings.store.checkout.askAddress')}${fTog('Wajib', 'settings.store.checkout.requireAddress')}</div>
        ${fTog('Catatan', 'settings.store.checkout.askNote')}</div>
      <div class="box wide"><h3>Pesan & Dialog Sukses</h3>
        <div class="row2">${fText('Judul dialog sukses', 'settings.store.checkout.successTitle')}${fText('Subjek email', 'settings.store.checkout.emailSubject')}</div>
        ${fArea('Teks dialog sukses', 'settings.store.checkout.successText', { rows: 2 })}
        ${fArea('Template pesan', 'settings.store.template', { rows: 8 })}
        <p class="hint">Placeholder: <code>{items}</code> <code>{summary}</code> <code>{customer}</code> <code>{subtotal}</code> <code>{discount}</code> <code>{shipping}</code> <code>{voucher}</code> <code>{total}</code> <code>{orderId}</code> <code>{brand}</code> <code>{name}</code> <code>{phone}</code> <code>{address}</code> <code>{note}</code> <code>{channel}</code>.</p></div></div>`;
  }

  /* ---------------- Maintenance (gaya + kustom) ---------------- */
  const MT_STYLES = [['noise', 'Noise — glitch brutal [503]'], ['minimal', 'Minimal — bersih & tenang'], ['countdown', 'Countdown — hitung mundur besar'], ['terminal', 'Terminal — layar hacker mengetik'], ['glass', 'Glass — kartu kaca di atas aurora'], ['split', 'Split — teks + gambar berdampingan']];
  function vMaintenance() {
    const m = S().maint, on = S().store.maintenance;
    return `<div class="grid2">
      <div class="box wide"><h3>Mode Maintenance ${on ? '<span class="pill no">TOKO TERTUTUP</span>' : '<span class="pill ok">TOKO BUKA</span>'} <button class="btn sm acc" data-a="mt-prev">▶ LIHAT PREVIEW</button></h3>
        ${fTog('Aktifkan maintenance (tutup toko untuk pengunjung)', 'settings.store.maintenance')}
        ${fSelect('Gaya tampilan', 'settings.maint.style', MT_STYLES)}
        <div class="row2">${fText('Judul (kosong = nama brand)', 'settings.maint.title')}${fText('Sub-judul kecil', 'settings.maint.subtitle', { ph: 'cth: Upgrade sistem & stok baru' })}</div>
        ${fArea('Pesan', 'settings.store.maintenanceText', { rows: 2 })}
        <p class="hint">Klik “Lihat preview” untuk melihat gaya terpilih di panel samping, tanpa menutup tokomu.</p></div>
      <div class="box"><h3>Jadwal & Hitung Mundur</h3>
        ${fDate('Mulai maintenance', 'settings.maint.from')}${fDate('Selesai / buka kembali', 'settings.maint.until')}
        ${fTog('Buka toko otomatis saat waktu selesai', 'settings.maint.autoOpen', 'Pengunjung tidak perlu menunggu kamu mematikan manual')}
        ${fTog('Tampilkan hitung mundur', 'settings.maint.showCountdown')}${fRange('Progress bar (0 = sembunyikan)', 'settings.maint.progress', 0, 100, 1)}</div>
      <div class="box"><h3>Isi Tambahan</h3>
        ${fTog('Tampilkan logo / nama brand', 'settings.maint.showLogo')}${fTog('Form “kabari saya” (kumpulkan email)', 'settings.maint.showSubscribe')}${fTog('Link sosial media', 'settings.maint.showSocial')}
        ${fText('Kode intip untuk pemilik', 'settings.maint.bypassKey', { ph: 'cth: rahasia123' })}
        <p class="hint">Buka <code>index.html?key=KODE</code> untuk melihat toko saat maintenance (berlaku selama tab terbuka).</p></div>
      <div class="box wide"><h3>Latar & Kustom</h3>
        ${fImage('Gambar latar (opsional; di gaya Split tampil di sisi kanan)', 'settings.maint.bgImage', { max: 1920 })}${fRange('Gelapkan gambar latar', 'settings.maint.overlay', 0, 0.95, 0.05)}
        ${fArea('HTML kustom (ditampilkan di bawah konten)', 'settings.maint.customHtml', { rows: 4, code: true, ph: '<p>Hubungi kami: …</p>' })}
        <p class="hint">HTML kustom hanya boleh diisi oleh admin tepercaya.</p></div></div>`;
  }

  /* ---------------- Font kustom (upload .ttf/.otf/.woff/.woff2) ---------------- */
  function fontBox() {
    const fonts = S().fonts || [];
    const list = fonts.length ? fonts.map((f, i) => `<div class="crow" style="grid-template-columns:minmax(0,1fr) auto auto"><div><b style="font-family:'${esc(f.name)}',system-ui">${esc(f.name)} — Aa Bb 123</b><small class="mono dim" style="display:block">${esc(String(f.fmt).toUpperCase())} · ${(f.size / 1024).toFixed(0)} KB${String(f.url).startsWith('data:') ? ' · tersimpan lokal' : ' · cloud'}</small></div>
        <div class="pre" style="gap:6px"><button class="btn sm" data-a="font-use" data-i="${i}" data-w="displayFont">JUDUL</button><button class="btn sm" data-a="font-use" data-i="${i}" data-w="bodyFont">BODY</button><button class="btn sm" data-a="font-use" data-i="${i}" data-w="monoFont">MONO</button></div>
        <button class="btn sm danger" data-a="font-del" data-i="${i}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada font kustom.</p>';
    return `<div class="box wide"><h3>Font Kustom <label class="btn sm acc" style="cursor:pointer">+ UPLOAD FONT<input type="file" accept=".ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2" hidden data-fontup="1"></label></h3>
      <p class="hint">Upload file <b>.ttf / .otf / .woff / .woff2</b>, lalu pakai untuk judul, body, atau label mono. ${T.remote ? 'File diupload ke Supabase Storage (maks 8 MB).' : 'Mode lokal: font disimpan di browser ini (maks 1,5 MB per font; pakai Supabase agar ringan & tampil di semua perangkat).'} Pastikan kamu punya lisensi font tersebut.</p>
      <div class="tbl">${list}</div></div>`;
  }
  async function uploadFontFile(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (['ttf', 'otf', 'woff', 'woff2'].indexOf(ext) < 0) { toast('FORMAT HARUS TTF / OTF / WOFF / WOFF2'); return; }
    const limit = T.remote ? 8 * 1048576 : 1.5 * 1048576;
    if (file.size > limit) { toast('FILE TERLALU BESAR (maks ' + (limit / 1048576) + ' MB)'); return; }
    toast('MEMERIKSA FONT…');
    const buf = await file.arrayBuffer(), h = new Uint8Array(buf, 0, 4), sig = String.fromCharCode.apply(null, h);
    const okSig = sig === 'OTTO' || sig === 'wOFF' || sig === 'wOF2' || sig === 'true' || (h[0] === 0 && h[1] === 1 && h[2] === 0 && h[3] === 0);
    let base = file.name.replace(/\.[^.]+$/, '').replace(/[^\w \-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 32) || 'Custom Font';
    const taken = (n) => T.FONTS.some((f) => f.n === n) || (S().fonts || []).some((f) => f.name === n);
    let name = base, k = 2; while (taken(name)) name = base + ' ' + k++;
    if (!okSig) { toast('FILE BUKAN FONT YANG VALID'); return; }
    try { const ff = new FontFace(name, buf); await ff.load(); document.fonts.add(ff); } catch (e) { console.error(e); toast('FONT TIDAK BISA DIMUAT (RUSAK?)'); return; }
    let url;
    try {
      if (T.remote && T.auth.isAdmin()) url = await T.uploadFont(file, ext);
      else url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).replace(/^data:[^;]*;/, 'data:font/' + (ext === 'ttf' ? 'ttf' : ext) + ';')); fr.onerror = rej; fr.readAsDataURL(file); });
    } catch (e) { console.error(e); toast('GAGAL UPLOAD FONT'); return; }
    T.update((x) => { x.settings.fonts = x.settings.fonts || []; x.settings.fonts.push({ id: T.uid('f'), name, url, fmt: ext, size: file.size }); });
    syncFonts(); render(); flashSaved(); toast('FONT “' + name + '” SIAP DIPAKAI ✦');
  }
  function syncFonts() { const el = $('#admFonts'); if (el) el.textContent = T.fontFaceCSS(); }

  /* ---------------- Riwayat versi (snapshot) & CSV produk ---------------- */
  const SNAPK = 'trsh_snaps';
  const snaps = () => { try { return JSON.parse(localStorage.getItem(SNAPK)) || []; } catch (e) { return []; } };
  function saveSnap(label, auto) {
    const dbx = JSON.parse(JSON.stringify(T.get())); delete dbx.subscribers;
    const json = JSON.stringify(dbx);
    if (auto && json.length > 1.5e6) return false; // jangan boros kuota otomatis
    const a = snaps(); a.unshift({ id: T.uid('s'), t: Date.now(), label, size: json.length, db: json });
    while (a.length > 10) a.pop();
    for (;;) { try { localStorage.setItem(SNAPK, JSON.stringify(a)); return true; } catch (e) { if (a.length <= 1) return false; a.pop(); } }
  }
  const CSV_COLS = ['id', 'name', 'price', 'category', 'stock', 'sizes', 'badge', 'sku', 'featured', 'active', 'sale_on', 'sale_type', 'sale_value', 'sale_start', 'sale_end', 'preorder_on', 'preorder_eta', 'desc'];
  const csvCell = (v) => { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  function productsCSV() {
    const rows = [CSV_COLS].concat(db().products.map((p) => { const sl = p.sale || {}, po = p.preorder || {}; return [p.id, p.name, p.price, p.category, p.stock, (p.sizes || []).join('|'), p.badge, p.sku || '', p.featured ? 1 : 0, p.active !== false ? 1 : 0, sl.on ? 1 : 0, sl.type || 'percent', sl.value || 0, sl.start || '', sl.end || '', po.on ? 1 : 0, po.eta || '', p.desc || '']; }));
    return '\ufeff' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }
  function parseCSV(t) {
    t = t.replace(/^\ufeff/, ''); const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.some((x) => x !== '')) rows.push(row); row = []; }
      else cell += c;
    }
    row.push(cell); if (row.some((x) => x !== '')) rows.push(row);
    return rows;
  }
  function importProductsCSV(text) {
    const rows = parseCSV(text); if (rows.length < 2) throw new Error('CSV kosong');
    const head = rows[0].map((h) => h.trim().toLowerCase()), idx = (k) => head.indexOf(k);
    if (idx('name') < 0) throw new Error('Kolom "name" wajib ada');
    let upd = 0, add = 0;
    T.update((x) => {
      rows.slice(1).forEach((r) => {
        const g = (k) => (idx(k) >= 0 ? (r[idx(k)] || '').trim() : undefined);
        const name = g('name'); if (!name) return;
        let p = (g('id') && x.products.find((q) => q.id === g('id'))) || x.products.find((q) => q.name.toLowerCase() === name.toLowerCase());
        const isNew = !p;
        if (isNew) { p = { id: T.uid('p'), name, price: 0, category: (x.categories[0] || {}).id || '', stock: 0, sizes: [], badge: '', desc: '', featured: false, active: true, images: [], createdAt: Date.now(), sku: '', sale: { on: false, type: 'percent', value: 0, start: '', end: '' }, preorder: { on: false, eta: '', limit: 5 } }; x.products.push(p); }
        p.name = name;
        const num = (k) => { const v = Number(String(g(k)).replace(/[^\d.\-]/g, '')); return isNaN(v) ? undefined : v; };
        if (g('price') !== undefined && num('price') !== undefined) p.price = Math.max(0, num('price'));
        if (g('stock') !== undefined && num('stock') !== undefined) p.stock = Math.max(0, Math.round(num('stock')));
        if (g('category')) p.category = g('category');
        if (g('sizes') !== undefined) p.sizes = g('sizes').split(/[|;]/).map((z) => z.trim()).filter(Boolean);
        if (g('badge') !== undefined) p.badge = g('badge');
        if (g('sku') !== undefined) p.sku = g('sku');
        if (g('desc') !== undefined) p.desc = g('desc');
        const bool = (k) => /^(1|true|ya|yes|y)$/i.test(g(k) || '');
        if (g('featured') !== undefined) p.featured = bool('featured');
        if (g('active') !== undefined) p.active = g('active') === '' ? true : bool('active');
        p.sale = Object.assign({ on: false, type: 'percent', value: 0, start: '', end: '' }, p.sale || {});
        if (g('sale_on') !== undefined) p.sale.on = bool('sale_on');
        if (g('sale_type') && ['percent', 'amount', 'price'].indexOf(g('sale_type')) >= 0) p.sale.type = g('sale_type');
        if (num('sale_value') !== undefined) p.sale.value = num('sale_value');
        if (g('sale_start') !== undefined) p.sale.start = g('sale_start');
        if (g('sale_end') !== undefined) p.sale.end = g('sale_end');
        p.preorder = Object.assign({ on: false, eta: '', limit: 5 }, p.preorder || {});
        if (g('preorder_on') !== undefined) p.preorder.on = bool('preorder_on');
        if (g('preorder_eta') !== undefined) p.preorder.eta = g('preorder_eta');
        if (isNew) add++; else upd++;
      });
    });
    return { upd, add };
  }
  function snapBox() {
    const a = snaps();
    return `<div class="box wide"><h3>Riwayat Versi <button class="btn sm acc" data-a="snap-save">+ SIMPAN SNAPSHOT SEKARANG</button></h3>
      <p class="hint">Cadangan otomatis (maks. 10) dari produk, kategori & pengaturan — disimpan di browser ini. Dibuat otomatis tiap kali kamu login. Pulihkan bila ada perubahan yang keliru.</p>
      ${a.length ? a.map((x) => `<div class="crow" style="grid-template-columns:minmax(0,1fr) auto auto"><div><b>${new Date(x.t).toLocaleString('id-ID')}</b><small class="mono dim" style="display:block">${esc(x.label)} · ${(x.size / 1024).toFixed(0)} KB</small></div><button class="btn sm" data-a="snap-restore" data-id="${esc(x.id)}">PULIHKAN</button><button class="btn sm danger" data-a="snap-del" data-id="${esc(x.id)}">✕</button></div>`).join('') : '<p class="hint dim">Belum ada snapshot.</p>'}</div>
    <div class="box wide"><h3>Produk via CSV (Excel / Google Sheets)</h3><p class="hint">Ekspor semua produk ke CSV, ubah massal di spreadsheet (harga, stok, diskon, pre-order), lalu impor kembali. Produk dicocokkan lewat <code>id</code> atau nama; baris baru otomatis ditambahkan. Foto tidak ikut CSV.</p>
      <div class="pre"><button class="btn acc" data-a="csv-exp">EXPORT CSV</button><label class="btn" style="cursor:pointer">IMPORT CSV<input type="file" accept=".csv,text/csv" id="csvIn" hidden></label></div></div>`;
  }

  const STATUS = [['new', 'BARU'], ['paid', 'DIBAYAR'], ['shipped', 'DIKIRIM'], ['done', 'SELESAI'], ['cancel', 'BATAL']];
  function orderLines(x) {
    const m = x.meta || {};
    const items = x.items.map((it) => `<li>${esc(it.name)}${it.size ? ' [' + esc(it.size) + ']' : ''} × ${it.qty} — ${T.money(it.price * it.qty)}${it.orig && it.orig > it.price ? ` <s>${T.money(it.orig * it.qty)}</s> <span class="pill ok">−${Math.round((1 - it.price / it.orig) * 100)}%</span>` : ''}</li>`).join('');
    const extra = [];
    if (m.itemDiscount > 0) extra.push('Diskon produk −' + T.money(m.itemDiscount));
    if (m.voucher) extra.push('Voucher ' + esc(m.voucher) + (m.voucherDiscount ? ' −' + T.money(m.voucherDiscount) : ''));
    if (m.shipping > 0) extra.push('Ongkir ' + T.money(m.shipping));
    return `<ul>${items}</ul>${extra.length ? `<p class="mono dim" style="margin-top:4px">${extra.join(' · ')}</p>` : ''}`;
  }
  function vOrders() {
    const all = T.orders.list(), subs = db().subscribers;
    const o = ofilter === 'all' ? all : all.filter((x) => x.status === ofilter);
    const chips = [['all', 'SEMUA']].concat(STATUS).map((c) => `<button class="sw ${ofilter === c[0] ? 'on' : ''}" data-a="o-f" data-s="${c[0]}">${c[1]} <small class="dim">${c[0] === 'all' ? all.length : all.filter((x) => x.status === c[0]).length}</small></button>`).join('');
    return `<div class="bar"><div class="pre" style="flex:1">${chips}</div><button class="btn" data-a="o-csv">EXPORT CSV</button><button class="btn danger" data-a="o-clear">HAPUS SEMUA</button></div>
      <div class="tbl">${o.length ? o.map((x) => `<div class="ord"><div class="ord-h"><div><b>${esc(x.id)}</b> <span class="mono dim">${new Date(x.time).toLocaleString('id-ID')}</span></div>
        <div style="display:flex;gap:8px;align-items:center"><b>${T.money(x.total)}</b><select data-a="o-st" data-id="${esc(x.id)}">${STATUS.map((s) => `<option value="${s[0]}" ${x.status === s[0] ? 'selected' : ''}>${s[1]}</option>`).join('')}</select><button class="btn sm danger" data-a="o-del" data-id="${esc(x.id)}">✕</button></div></div>
        ${orderLines(x)}</div>`).join('') : '<div class="empty">' + (all.length ? 'Tidak ada pesanan dengan status ini.' : 'Belum ada pesanan.<br><span class="dim">Pesanan tercatat saat pembeli menekan Checkout di toko' + (T.remote ? '' : ' (browser yang sama)') + '.</span>') + '</div>'}</div>
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
      ${snapBox()}<div class="box"><h3>Reset</h3><p class="hint">Kembalikan seluruh produk, kategori, dan pengaturan ke bawaan. Pesanan tidak dihapus.</p><button class="btn danger" data-a="reset">RESET KE DEFAULT</button></div>
      <div class="box"><h3>Koneksi</h3>${R
        ? `<p class="hint"><b>Supabase terhubung ☁</b> — produk, kategori, pengaturan, pesanan, subscriber, dan foto tersimpan di database dan tampil realtime ke semua pengunjung.</p>`
        : `<p class="hint"><b>Mode lokal</b> — data hanya di browser ini (${(T.size() / 1024).toFixed(0)} KB dari ±5000 KB). Isi <code>assets/js/config.js</code> untuk menghubungkan Supabase.</p>`}</div></div>`;
  }

  const VIEWS = { checkout: vCheckout, maintenance: vMaintenance, dashboard: vDashboard, products: vProducts, categories: vCategories, promo: vPromo, social: vSocial, advanced: vAdvanced, appearance: vAppearance, content: vContent, features: vFeatures, orders: vOrders, system: vSystem };

  function render() {
    const t = TABS.find((x) => x[0] === tab) || TABS[0];
    $('#title').textContent = t[1];
    $('#nav').innerHTML = TABS.map((x) => `<button class="${x[0] === tab ? 'on' : ''}" data-a="tab" data-t="${x[0]}"><span>${x[2]}</span>${x[1]}</button>`).join('');
    syncFonts();
    $('#view').innerHTML = (VIEWS[tab] || vDashboard)();
    $('#brandName').textContent = S().brand.name;
  }
  function go(t) { tab = t; sessionStorage.setItem('trsh_tab', t); render(); $('#view').scrollTop = 0; }

  /* ---------------- image upload ---------------- */
  function fileToData(file, max, alpha) {
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
          const keep = !!alpha && /^image\/(png|webp|gif|svg)/.test(file.type); // logo transparan tetap PNG
          const mime = keep ? 'image/png' : 'image/jpeg';
          if (T.remote && T.auth.isAdmin()) c.toBlob((b) => { if (!b) rej(new Error('Gagal memproses gambar')); else T.uploadImage(b).then(res, rej); }, mime, 0.85);
          else res(c.toDataURL(mime, 0.82));
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
    } else if (el.dataset && el.dataset.fontup) {
      const f = el.files[0]; el.value = ''; if (f) uploadFontFile(f);
    } else if (el.id === 'csvIn') {
      const f = el.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try { const res = importProductsCSV(String(r.result)); toast(res.upd + ' DIPERBARUI · ' + res.add + ' DITAMBAH ✦'); render(); flashSaved(); }
        catch (err) { console.error(err); toast('CSV TIDAK VALID: ' + (err.message || '')); }
      };
      r.readAsText(f); el.value = '';
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
      case 'go-promo': go('promo'); break;
      case 'go-checkout': go('checkout'); break;
      case 'alt-acc-clear': T.set('settings.theme.alt.accent', ''); render(); flashSaved(); break;
      case 'mt-prev': { document.body.classList.add('pv-on'); $('#pvFrame').src = 'index.html?preview=1&maint=1&t=' + Date.now(); break; }
      case 'font-use': { const f = (S().fonts || [])[i]; if (f) { T.set('settings.theme.' + el.dataset.w, f.name); render(); flashSaved(); toast('FONT DIPAKAI ✦'); } break; }
      case 'font-del': {
        const f = (S().fonts || [])[i]; if (!f) break;
        ask('Hapus font “' + f.name + '”?\nBagian yang memakainya kembali ke font bawaan.').then((ok) => {
          if (!ok) return;
          T.update((x) => { const th = x.settings.theme; ['displayFont', 'bodyFont', 'monoFont'].forEach((k) => { if (th[k] === f.name) th[k] = k === 'monoFont' ? 'JetBrains Mono' : k === 'bodyFont' ? 'Inter' : 'Unbounded'; }); x.settings.fonts.splice(i, 1); });
          syncFonts(); render(); flashSaved();
        });
        break;
      }
      case 'snap-save': toast(saveSnap('Manual', false) ? 'SNAPSHOT DISIMPAN ✦' : 'GAGAL — KUOTA PENUH'); render(); break;
      case 'snap-restore': {
        const x = snaps().find((q) => q.id === el.dataset.id); if (!x) break;
        ask('Pulihkan versi ' + new Date(x.t).toLocaleString('id-ID') + '?\nProduk, kategori & pengaturan saat ini akan diganti (snapshot otomatis dibuat dulu).', 'PULIHKAN', false).then((ok) => {
          if (!ok) return;
          saveSnap('Sebelum pemulihan', false);
          try { T.importJSON(JSON.stringify({ v: 1, db: JSON.parse(x.db) })); syncFonts(); render(); toast('VERSI DIPULIHKAN ✦'); } catch (err) { console.error(err); toast('GAGAL MEMULIHKAN'); }
        });
        break;
      }
      case 'snap-del': { const a = snaps().filter((q) => q.id !== el.dataset.id); try { localStorage.setItem(SNAPK, JSON.stringify(a)); } catch (x) {} render(); break; }
      case 'csv-exp': dl('trsh-produk-' + new Date().toISOString().slice(0, 10) + '.csv', productsCSV(), 'text/csv'); break;
      case 'd-set': {
        const path = el.dataset.path, v = el.dataset.clear ? '' : new Date(Date.now() + Number(el.dataset.add)).toISOString();
        T.set(path, v);
        const inp = document.querySelector('input[type=datetime-local][data-path="' + path + '"]'); if (inp) inp.value = isoToLocal(v);
        if (editing >= 0) refreshSalePrev();
        flashSaved(); break;
      }
      case 'img-clear': T.set(el.dataset.path, ''); render(); flashSaved(); break;
      case 'pp-test': {
        if (!document.body.classList.contains('pv-on')) togglePreview();
        const f = $('#pvFrame'); let n = 0;
        const go2 = () => { try { f.contentWindow.TRSH_UI.showPopup(); } catch (x) { if (++n < 24) setTimeout(go2, 250); else toast('Preview belum siap — coba lagi'); } };
        go2(); break;
      }
      case 'go-social': go('social'); break;
      case 'v-add': T.update((x) => x.settings.vouchers.push({ id: T.uid('v'), code: 'PROMO' + Math.floor(Math.random() * 90 + 10), type: 'percent', value: 10, minSpend: 0, maxDiscount: 0, expires: '', active: true })); render(); flashSaved(); break;
      case 'v-del': T.update((x) => x.settings.vouchers.splice(i, 1)); render(); flashSaved(); break;
      case 'promo-cat': T.update((x) => { const c = x.settings.promo.cats = x.settings.promo.cats || []; const k = c.indexOf(el.dataset.id); if (k >= 0) c.splice(k, 1); else c.push(el.dataset.id); }); render(); flashSaved(); break;
      case 'soc-add': T.update((x) => { x.settings.socialExtra = x.settings.socialExtra || []; x.settings.socialExtra.push({ label: 'LINK', url: '', on: true }); }); render(); flashSaved(); break;
      case 'soc-del': T.update((x) => x.settings.socialExtra.splice(i, 1)); render(); flashSaved(); break;
      case 'soc-all-off': T.update((x) => { T.SOCIALS.forEach((d) => { x.settings.socialOn[d.k] = false; }); (x.settings.socialExtra || []).forEach((e) => { e.on = false; }); }); render(); flashSaved(); break;
      case 'soc-all-on': T.update((x) => { T.SOCIALS.forEach((d) => { x.settings.socialOn[d.k] = !!T.socialHref(d.k, (x.settings.social || {})[d.k]); }); }); render(); flashSaved(); break;
      case 'sec-up': case 'sec-dn': T.update((x) => { const o = T.sectionOrder(), j = a === 'sec-up' ? i - 1 : i + 1; if (j < 0 || j >= o.length) return; o.splice(j, 0, o.splice(i, 1)[0]); x.settings.order = o; }); render(); flashSaved(); break;
      case 'lbl-reset': T.update((x) => { x.settings.labels = JSON.parse(JSON.stringify(T.LABELS)); }); render(); flashSaved(); break;
      case 'o-f': ofilter = el.dataset.s; render(); break;
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
        ask('Hapus produk “' + d.products[i].name + '”?').then((ok) => { if (!ok) return; closeEditor(); T.update((x) => x.products.splice(i, 1)); if (tab === 'products') $('#ptbody').innerHTML = productRows(); else render(); flashSaved(); });
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
        ask('Hapus kategori “' + c.name + '”?' + (used ? '\n' + used + ' produk akan menjadi tanpa kategori.' : '')).then((ok) => {
          if (!ok) return;
          T.update((x) => { x.products.forEach((p) => { if (p.category === c.id) p.category = ''; }); x.categories.splice(i, 1); }); render(); flashSaved();
        });
        break;
      }

      /* appearance */
      case 'preset': T.update((x) => Object.assign(x.settings.theme, PRESETS[el.dataset.k])); render(); flashSaved(); break;

      /* features */
      case 'f-add': T.update((x) => x.settings.custom.flags.push({ key: 'flag' + (x.settings.custom.flags.length + 1), label: '', value: 'on' })); render(); flashSaved(); break;
      case 'f-del': T.update((x) => x.settings.custom.flags.splice(i, 1)); render(); flashSaved(); break;

      /* orders */
      case 'o-del': ask('Hapus pesanan ini?').then((ok) => { if (ok) { T.orders.remove(el.dataset.id); render(); } }); break;
      case 'o-clear': ask('Hapus SEMUA pesanan?\nTindakan ini tidak bisa dibatalkan.').then((ok) => { if (ok) { T.orders.clear(); render(); } }); break;
      case 'o-csv': {
        const rows = [['id', 'waktu', 'status', 'subtotal', 'diskon_produk', 'voucher', 'diskon_voucher', 'ongkir', 'total', 'item']].concat(T.orders.list().map((o) => { const m = o.meta || {}; return [o.id, new Date(o.time).toISOString(), o.status, m.subtotal || '', m.itemDiscount || 0, m.voucher || '', m.voucherDiscount || 0, m.shipping || 0, o.total, o.items.map((it) => `${it.name}${it.size ? ' [' + it.size + ']' : ''} x${it.qty} @${it.price}`).join(' | ')]; }));
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
      case 'reset': ask('Reset semua produk, kategori, dan pengaturan ke default?\nPesanan tidak ikut dihapus.', 'RESET').then((ok) => { if (ok) { T.reset(); render(); toast('RESET SELESAI'); } }); break;
    }
  });

  function addProduct() {
    T.update((x) => x.products.unshift({
      id: T.uid('p'), name: 'PRODUK BARU', price: 100000, category: (x.categories[0] || {}).id || '', stock: 10,
      sizes: ['S', 'M', 'L', 'XL'], badge: 'NEW', desc: '', featured: false, active: true, images: [], createdAt: Date.now(),
      sku: '', sale: { on: false, type: 'percent', value: 0, start: '', end: '' }, preorder: { on: false, eta: '', limit: 5 },
    }));
    if (tab === 'products') $('#ptbody').innerHTML = productRows();
    openEditor(0);
  }

  /* upload gambar untuk kolom gambar (logo, hero, popup) */
  document.addEventListener('change', async (e) => {
    const el = e.target;
    if (!el.matches || !el.matches('input[data-up]')) return;
    const f = el.files && el.files[0]; if (!f) return;
    toast('MEMPROSES GAMBAR…');
    try { const u = await fileToData(f, Number(el.dataset.max) || 1600, !!el.dataset.alpha); T.set(el.dataset.up, u); render(); flashSaved(); toast('GAMBAR DIPASANG ✦'); }
    catch (err) { console.error(err); toast('GAGAL MEMPROSES GAMBAR'); }
    el.value = '';
  });

  /* ---------------- preview ---------------- */
  function togglePreview() {
    const on = document.body.classList.toggle('pv-on');
    const f = $('#pvFrame');
    if (on && f.getAttribute('src') === 'about:blank') f.src = 'index.html?preview=1';
  }

  /* ---------------- auth ---------------- */
  function enter() {
    $('#login').hidden = true; $('#app').hidden = false; render();
    if (!sessionStorage.getItem('trsh_autosnap')) { sessionStorage.setItem('trsh_autosnap', '1'); try { saveSnap('Otomatis saat login', true); } catch (e) {} }
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
