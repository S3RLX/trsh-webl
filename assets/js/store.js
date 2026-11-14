/* ==========================================================
   TRSH — data layer
   Supabase (database + auth + realtime + storage) dengan cache
   localStorage. Bila assets/js/config.js kosong → mode lokal.
   Dipakai bersama oleh index.html (toko) dan admin.html (panel)
   ========================================================== */
(function (w) {
  'use strict';

  const KEY = 'trsh_db_v1';
  const OKEY = 'trsh_orders_v1';
  let bc = null;
  try { bc = new BroadcastChannel('trsh_sync'); } catch (e) {}

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function merge(base, over) {
    const out = clone(base);
    (function m(a, b) {
      for (const k in b) {
        if (isObj(b[k]) && isObj(a[k])) m(a[k], b[k]);
        else a[k] = b[k];
      }
    })(out, over || {});
    return out;
  }
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) {
    const k = p.split('.');
    for (let i = 0; i < k.length - 1; i++) {
      if (o[k[i]] == null) o[k[i]] = {};
      o = o[k[i]];
    }
    o[k[k.length - 1]] = v;
  }

  /* ---------- Font library (admin bisa memilih) ---------- */
  const FONTS = [
    { n: 'Unbounded', w: '400;700;900' },
    { n: 'Space Grotesk', w: '400;500;700' },
    { n: 'Syne', w: '400;700;800' },
    { n: 'Archivo Black', w: '' },
    { n: 'Anton', w: '' },
    { n: 'Bebas Neue', w: '' },
    { n: 'Orbitron', w: '400;700;900' },
    { n: 'Michroma', w: '' },
    { n: 'Chakra Petch', w: '400;500;700' },
    { n: 'Oswald', w: '400;700' },
    { n: 'Inter', w: '400;500;700' },
    { n: 'Playfair Display', w: '400;700' },
    { n: 'Cormorant Garamond', w: '400;600' },
    { n: 'JetBrains Mono', w: '400;700' },
    { n: 'IBM Plex Mono', w: '400;500;700' },
    { n: 'Space Mono', w: '400;700' },
    { n: 'DM Mono', w: '400;500' },
    { n: 'Major Mono Display', w: '' },
    { n: 'Press Start 2P', w: '' },
    { n: 'VT323', w: '' },
  ];
  function fontUrl(names) {
    const seen = {};
    const fam = [];
    names.forEach((n) => {
      const f = FONTS.find((x) => x.n === n);
      if (!f || seen[n]) return;
      seen[n] = 1;
      fam.push('family=' + f.n.replace(/ /g, '+') + (f.w ? ':wght@' + f.w : ''));
    });
    return fam.length ? 'https://fonts.googleapis.com/css2?' + fam.join('&') + '&display=swap' : 'data:text/css,';
  }
  function fontStack(name, kind) {
    const tail = kind === 'mono' ? 'ui-monospace,Menlo,monospace' : 'system-ui,-apple-system,sans-serif';
    return "'" + name + "'," + tail;
  }

  /* ---------- Default data ---------- */
  const inDays = (n) =>
    new Date(Date.now() + n * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

  const P = (id, name, price, category, stock, sizes, badge, desc, featured) => ({
    id, name, price, category, stock, sizes, badge: badge || '', desc,
    featured: !!featured, active: true, images: [], createdAt: Date.now() - Math.random() * 1e9,
  });
  const CL = ['S', 'M', 'L', 'XL'];

  const DEFAULTS = {
    settings: {
      brand: { name: 'TRSH', fullName: 'RUDE TRASH', tagline: 'WEAR THE NOISE. KEEP IT RUDE.' },
      theme: {
        bg: '#09090b', fg: '#ececf0', muted: '#8b8b95', card: '#101013', accent: '#c8ff2e', line: '#26262c',
        displayFont: 'Unbounded', bodyFont: 'Space Grotesk', monoFont: 'JetBrains Mono',
        radius: 2, gridCols: 4, ratio: '4/5', animSpeed: 1,
      },
      effects: {
        preloader: true, grain: true, cursor: true, scanlines: false,
        reveal: true, glitch: true, tilt: true, sparkles: true,
      },
      hero: {
        eyebrow: '[ DROP 001 — UNDERGROUND SERIES ]',
        line1: 'RUDE', line2: 'TRASH',
        sub: 'Streetwear dari bawah tanah. Potongan boxy, cuci kasar, detail kromium. Diproduksi terbatas — tanpa restock.',
        cta: 'SHOP THE DROP', ctaLink: '#shop',
        showSticker: true, sticker: 'LIMITED EDITION',
      },
      marquee: { text: 'FREE ONGKIR > 500K ✦ LIMITED PIECES ✦ NO RESTOCK ✦ RUDE BY DESIGN', speed: 28 },
      announcement: { enabled: true, text: 'DROP 001 LIVE — STOK TERBATAS' },
      drop: { title: 'NEXT DROP IN', note: 'Drop 002 — “NO SIGNAL” capsule. Set reminder.', date: inDays(14) },
      shop: { kicker: '[ 02 — CATALOG ]', title: 'THE CATALOG' },
      about: {
        kicker: '[ 03 — MANIFESTO ]', title: 'BORN IN THE\nBACKROOM.',
        text: 'TRSH lahir dari sisa kain, noise, dan malam yang terlalu panjang. Kami tidak mengejar tren — kami membuat pakaian untuk orang yang lebih nyaman di pinggir ruangan. Setiap drop diproduksi kecil, dicuci kasar, dan tidak pernah diulang.',
      },
      footer: {
        newsletterTitle: 'JOIN THE NOISE', newsletterText: 'Masukkan email untuk akses awal setiap drop.',
        text: '© 2026 RUDE TRASH. ALL RIGHTS RESERVED.',
      },
      social: { instagram: 'https://instagram.com/', tiktok: 'https://tiktok.com/', email: 'hello@trsh.store' },
      sections: { hero: true, marquee: true, drop: true, shop: true, extra: false, about: true, newsletter: true },
      store: {
        currency: 'Rp', whatsapp: '6281234567890',
        cart: true, wishlist: true, search: true, sort: true, showStock: true, lowStock: 5,
        maintenance: false, maintenanceText: 'SEDANG MAINTENANCE. KAMI SEGERA KEMBALI.',
        template: 'Halo TRSH! Saya mau order:\n{items}\n\nTotal: {total}\n\nNama:\nAlamat:\nCatatan:',
      },
      custom: { flags: [], css: '', extraHtml: '' },
      admin: { password: 'rude123' },
    },
    categories: [
      { id: 'tees', name: 'TEES', visible: true },
      { id: 'hoodies', name: 'HOODIES', visible: true },
      { id: 'bottoms', name: 'BOTTOMS', visible: true },
      { id: 'accessories', name: 'ACCESSORIES', visible: true },
    ],
    products: [
      P('p1', 'RUDE LOGO TEE', 189000, 'tees', 24, CL, 'NEW', 'Heavyweight 240gsm, boxy fit, sablon puff di dada. Cuci kasar untuk tekstur vintage.', true),
      P('p2', 'TRASH CLASSIC TEE — WASHED', 199000, 'tees', 18, CL, '', 'Washed black, graphic back print. Pewarnaan tidak merata adalah fitur, bukan cacat.'),
      P('p3', 'NO SIGNAL HOODIE', 449000, 'hoodies', 9, CL, 'LIMITED', 'Fleece 420gsm. Oversized, bordir 3D, kangaroo pocket tersembunyi.', true),
      P('p4', 'CHROME HEART ZIP', 499000, 'hoodies', 4, CL, 'LOW', 'Zip hoodie dengan hardware kromium dan lining mesh. Edisi sangat terbatas.', true),
      P('p5', 'CARGO VOID PANTS', 379000, 'bottoms', 12, ['28', '30', '32', '34'], '', 'Cargo parachute, adjustable hem, 6 kantong. Ripstop ringan.'),
      P('p6', 'DISTRESSED BAGGY DENIM', 429000, 'bottoms', 0, ['28', '30', '32', '34'], 'SOLD OUT', 'Baggy cut, distressed manual, wash abu gelap.'),
      P('p7', 'SPARKLE TRUCKER CAP', 149000, 'accessories', 30, ['ONE SIZE'], 'NEW', 'Trucker mesh, patch ✦ chrome, strap snapback.'),
      P('p8', 'BARCODE TOTE', 129000, 'accessories', 15, ['ONE SIZE'], '', 'Canvas tebal, resleting dalam, barcode print.'),
      P('p9', 'STICKER PACK — 10PCS', 49000, 'accessories', 80, ['ONE SIZE'], '', 'Vinyl waterproof, 10 desain rilis Drop 001.'),
    ],
    subscribers: [],
  };

  /* ---------- Supabase (otomatis mode lokal bila config kosong) ---------- */
  const cfg = w.TRSH_CONFIG || {};
  const REMOTE = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && w.supabase && w.supabase.createClient);
  const BUCKET = cfg.BUCKET || 'product-images';
  const sb = REMOTE
    ? w.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
    : null;
  if (!REMOTE) console.info('TRSH: mode LOKAL — isi assets/js/config.js untuk menghubungkan Supabase');
  if (REMOTE) delete DEFAULTS.settings.admin; // login admin memakai Supabase Auth, bukan password di data
  const KEYS = ['settings', 'categories', 'products'];
  const STATUSES = ['new', 'paid', 'shipped', 'done', 'cancel'];
  const MAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  // JSON dengan urutan key stabil (jsonb di Postgres tidak menjaga urutan key)
  const stable = (v) => JSON.stringify(v, (k, x) => (isObj(x) ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));

  /* ---------- State ---------- */
  const legacyOrders = () => { try { return JSON.parse(localStorage.getItem(OKEY)) || []; } catch (e) { return []; } };
  const legacy = { subs: [], orders: [] };
  let db = load();
  const subs = [];
  const saved = {}, pending = {};
  let isAdmin = false, timer = 0, inflight = false, remoteRows = -1, ordersCache = [], adminCh = null, adminEmail = '';
  if (REMOTE) { legacy.subs = (db.subscribers || []).slice(); legacy.orders = legacyOrders(); db.subscribers = []; }

  function load() {
    let raw = null, d = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    if (raw) { try { d = merge(DEFAULTS, JSON.parse(raw)); } catch (e) { console.warn('TRSH: data rusak, memakai default', e); } }
    if (!d) { d = clone(DEFAULTS); try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
    if (REMOTE && d.settings) delete d.settings.admin;
    return d;
  }
  // cache lokal: tampil instan saat dibuka & sinkron antar-tab; sumber kebenaran tetap Supabase
  function cache() {
    try {
      const c = clone(db);
      if (REMOTE) { delete c.subscribers; if (c.settings) delete c.settings.admin; }
      localStorage.setItem(KEY, JSON.stringify(c));
      return true;
    } catch (e) { if (!REMOTE && T.onError) T.onError(e); return REMOTE; }
  }
  function persist() {
    const ok = cache();
    if (ok && bc) { try { bc.postMessage({ t: Date.now() }); } catch (e) {} }
    if (REMOTE && isAdmin) queue();
    return ok;
  }
  function notify(src) {
    subs.forEach((f) => { try { f(db, src); } catch (e) { console.error(e); } });
  }
  function remote() {
    if (REMOTE && isAdmin) return; // tab admin adalah sumber kebenaran
    const keep = db.subscribers;
    db = load();
    if (REMOTE) db.subscribers = keep || [];
    notify('remote');
  }
  w.addEventListener('storage', (e) => { if (e.key === KEY || e.key === OKEY) remote(); });
  if (bc) bc.onmessage = () => remote();

  function status(state, err) {
    T.status = state;
    if (T.onStatus) { try { T.onStatus({ state, error: err }); } catch (e) {} }
  }

  /* ---------- Simpan ke Supabase (debounce) ---------- */
  const pubSettings = () => { const s = clone(db.settings); delete s.admin; return s; };
  function queue() { clearTimeout(timer); status('saving'); timer = setTimeout(flush, 500); }
  async function flush() {
    timer = 0;
    if (!REMOTE || !isAdmin) return;
    if (inflight) { timer = setTimeout(flush, 300); return; }
    const rows = [];
    KEYS.forEach((k) => {
      const v = k === 'settings' ? pubSettings() : db[k];
      const js = stable(v);
      if (js !== saved[k]) rows.push({ key: k, value: clone(v), js });
    });
    if (!rows.length) { if (!timer) status('saved'); return; }
    inflight = true;
    rows.forEach((r) => { pending[r.key] = r.js; });
    const now = new Date().toISOString();
    let error = null;
    try {
      ({ error } = await sb.from('store_data').upsert(rows.map((r) => ({ key: r.key, value: r.value, updated_at: now })), { onConflict: 'key' }));
    } catch (e) { error = e; }
    inflight = false;
    rows.forEach((r) => { delete pending[r.key]; });
    if (error) { status('error', error); if (T.onError) T.onError(error, 'remote'); return; }
    rows.forEach((r) => { saved[r.key] = r.js; });
    if (!timer) status('saved');
  }

  /* ---------- Muat dari Supabase + realtime ---------- */
  async function fetchRemote() {
    let res;
    try { res = await sb.from('store_data').select('key,value'); } catch (e) { res = { error: e }; }
    if (res.error) { console.warn('TRSH: gagal memuat dari Supabase —', res.error.message || res.error); return false; }
    remoteRows = res.data.length;
    if (res.data.length) {
      const o = {};
      res.data.forEach((r) => { if (KEYS.includes(r.key)) { o[r.key] = r.value; saved[r.key] = stable(r.value); } });
      const keep = db.subscribers;
      db = merge(DEFAULTS, o);
      db.subscribers = keep || [];
      cache();
      notify('remote');
    }
    return true;
  }
  function listen() {
    sb.channel('trsh-store')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'store_data' }, (p) => {
        const r = p.new;
        if (!r || !r.key || !KEYS.includes(r.key)) return;
        if (r.value === undefined) { fetchRemote(); return; }
        const js = stable(r.value);
        if (js === saved[r.key] || js === pending[r.key]) return;     // gema dari simpanan sendiri
        if (isAdmin && (timer || inflight)) return;                   // jangan timpa ketikan admin
        db[r.key] = r.key === 'settings' ? merge(DEFAULTS.settings, r.value) : r.value;
        saved[r.key] = js;
        cache();
        notify('remote');
      })
      .subscribe();
  }

  /* ---------- Pesanan & subscriber (admin) ---------- */
  const mapOrder = (r) => ({ id: r.id, time: Date.parse(r.created_at), status: r.status, total: Number(r.total), items: r.items || [] });
  const toRow = (o) => ({
    id: String(o.id), status: STATUSES.includes(o.status) ? o.status : 'new', total: Number(o.total) || 0,
    items: Array.isArray(o.items) ? o.items : [], created_at: new Date(o.time || Date.now()).toISOString(),
  });
  async function loadAdminData() {
    const [o, s] = await Promise.all([
      sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
      sb.from('subscribers').select('*').order('created_at', { ascending: false }).limit(5000),
    ]);
    if (!o.error) ordersCache = o.data.map(mapOrder);
    if (!s.error) db.subscribers = s.data.map((x) => ({ email: x.email, time: Date.parse(x.created_at) }));
  }
  function listenAdmin() {
    if (adminCh) return;
    let t = 0;
    const re = () => { clearTimeout(t); t = setTimeout(async () => { await loadAdminData(); notify('remote'); }, 250); };
    adminCh = sb.channel('trsh-admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, re)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'subscribers' }, re)
      .subscribe();
  }
  async function importOrders(arr) {
    const rows = arr.map(toRow);
    for (let i = 0; i < rows.length; i += 100) {
      const { error } = await sb.from('orders').upsert(rows.slice(i, i + 100), { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
    }
  }

  /* ---------- Pesanan baru dari pembeli (dengan antrean ulang bila gagal) ---------- */
  const PKEY = 'trsh_orders_pending';
  const pend = () => { try { return JSON.parse(localStorage.getItem(PKEY)) || []; } catch (e) { return []; } };
  const setPend = (a) => { try { if (a.length) localStorage.setItem(PKEY, JSON.stringify(a)); else localStorage.removeItem(PKEY); } catch (e) {} };
  async function sendOrder(row) {
    const { error } = await sb.from('orders').insert(row);
    if (error && error.code !== '23505') throw error;
  }
  async function flushPending() {
    const q = pend(); if (!q.length) return;
    const left = [];
    for (const r of q) { try { await sendOrder(r); } catch (e) { left.push(r); } }
    setPend(left);
  }

  /* ---------- Auth admin ---------- */
  async function checkAdmin() {
    const { data } = await sb.auth.getSession();
    const session = data && data.session;
    if (!session) { isAdmin = false; return false; }
    const r = await sb.rpc('is_admin');
    isAdmin = !r.error && r.data === true;
    adminEmail = isAdmin ? session.user.email : '';
    return isAdmin;
  }
  async function becameAdmin() {
    if (remoteRows < 0) await fetchRemote();
    if (remoteRows < 0) { isAdmin = false; throw new Error('OFFLINE'); } // jangan pernah menimpa data jarak jauh dengan cache basi
    await loadAdminData();
    listenAdmin();
    if (remoteRows === 0) { // database masih kosong → unggah data saat ini (config lama di browser / default)
      remoteRows = 1;
      status('saving');
      await flush();
      try {
        if (legacy.orders.length) await importOrders(legacy.orders);
        const ls = legacy.subs.filter((s) => s && MAIL.test(String(s.email)));
        if (ls.length) await sb.from('subscribers').upsert(ls.map((s) => ({ email: String(s.email).toLowerCase(), created_at: new Date(s.time || Date.now()).toISOString() })), { onConflict: 'email', ignoreDuplicates: true });
        await loadAdminData();
      } catch (e) { console.warn('TRSH: migrasi data lama gagal', e); }
    }
    notify('remote');
  }
  const auth = {
    enabled: REMOTE,
    isAdmin: () => isAdmin,
    get user() { return adminEmail; },
    async init() {
      if (!REMOTE) return false;
      await ready;
      try { if (await checkAdmin()) { await becameAdmin(); return true; } } catch (e) { console.warn('TRSH:', e.message || e); }
      return false;
    },
    async signIn(email, password) {
      await ready;
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error('LOGIN');
      if (!(await checkAdmin())) { await sb.auth.signOut(); throw new Error('NOT_ADMIN'); }
      await becameAdmin();
      return true;
    },
    async signOut() {
      isAdmin = false;
      if (adminCh) { sb.removeChannel(adminCh); adminCh = null; }
      if (REMOTE) await sb.auth.signOut();
    },
    async changePassword(pw) {
      const { error } = await sb.auth.updateUser({ password: pw });
      if (error) throw error;
    },
  };
  if (REMOTE) sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') isAdmin = false; });

  /* ---------- Orders lokal (mode lokal saja) ---------- */
  const ol = () => legacyOrders();
  const os = (a) => {
    try { localStorage.setItem(OKEY, JSON.stringify(a)); } catch (e) {}
    if (bc) { try { bc.postMessage({ t: Date.now() }); } catch (e) {} }
  };

  /* ---------- Helpers ---------- */
  function hue(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % 360; }
  const xml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Placeholder visual otomatis bila produk belum punya foto */
  function placeholder(p, v) {
    v = v || 0;
    const a = db.settings.theme.accent;
    const h = hue(p.id || p.name || 'x');
    const inv = v === 1;
    const c1 = inv ? '#ececf0' : '#1a1a20';
    const c2 = inv ? '#8f8f9b' : '#050506';
    const ink = inv ? '#09090b' : '#f2f2f5';
    const acc = inv ? '#09090b' : a;
    const shapes = [
      `<circle cx="300" cy="340" r="130" fill="none" stroke="${acc}" stroke-width="2"/><circle cx="300" cy="340" r="86" fill="none" stroke="${ink}" stroke-opacity=".45"/><circle cx="300" cy="340" r="5" fill="${acc}"/>`,
      `<path d="M300 170C308 290 340 322 450 340C340 358 308 390 300 510C292 390 260 358 150 340C260 322 292 290 300 170Z" fill="none" stroke="${acc}" stroke-width="2"/><circle cx="300" cy="340" r="150" fill="none" stroke="${ink}" stroke-opacity=".25"/>`,
      `<path d="M300 190V490M150 340H450" stroke="${acc}" stroke-width="2"/><rect x="235" y="275" width="130" height="130" fill="none" stroke="${ink}" stroke-opacity=".45"/>`,
      `<path d="M300 200L460 470H140Z" fill="none" stroke="${acc}" stroke-width="2"/><path d="M300 275L395 435H205Z" fill="none" stroke="${ink}" stroke-opacity=".4"/>`,
    ];
    let bars = '';
    let x = 430, seed = h;
    for (let i = 0; i < 18; i++) {
      seed = (seed * 9301 + 49297) % 233280;
      const wd = 1 + (seed % 4);
      bars += `<rect x="${x}" y="676" width="${wd}" height="34" fill="${ink}" fill-opacity=".8"/>`;
      x += wd + 3 + (seed % 3);
      if (x > 570) break;
    }
    const name = xml(String(p.name || '').slice(0, 24));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient>
<radialGradient id="r" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="hsl(${h},85%,58%)" stop-opacity="${inv ? '.18' : '.3'}"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
<pattern id="gr" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="${ink}" stroke-opacity=".07"/></pattern></defs>
<rect width="600" height="750" fill="url(#g)"/><rect width="600" height="750" fill="url(#gr)"/><rect width="600" height="750" fill="url(#r)"/>
${shapes[h % 4]}
<g font-family="monospace" font-size="16" fill="${ink}" letter-spacing="3"><text x="32" y="48">TRSH ✦ ${String(h).padStart(3, '0')}</text><text x="568" y="48" text-anchor="end">N°${(h % 90) + 10}</text><text x="32" y="700" font-size="17">${name}</text><text x="32" y="722" fill-opacity=".5" font-size="12">RUDE TRASH / DROP 001</text></g>
${bars}
<rect x="14" y="14" width="572" height="722" fill="none" stroke="${ink}" stroke-opacity=".14"/></svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function contrast(hex) {
    const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex || '');
    if (!m) return '#000000';
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#09090b' : '#ffffff';
  }

  /* ---------- Public API ---------- */
  const T = {
    FONTS, fontUrl, fontStack, contrast, placeholder, getPath,
    remote: REMOTE, auth, status: 'idle',
    get: () => db,
    update(fn) { fn(db); persist(); notify('local'); },
    set(path, val) { setPath(db, path, val); persist(); notify('local'); },
    on(fn) { subs.push(fn); },
    uid: (p) => (p || 'id') + Math.random().toString(36).slice(2, 8),
    money(n) { return (db.settings.store.currency || '') + ' ' + Math.round(n || 0).toLocaleString('id-ID'); },
    reset() {
      const keep = db.subscribers;
      db = clone(DEFAULTS); db.settings.drop.date = inDays(14);
      if (REMOTE) db.subscribers = keep || [];
      persist(); notify('local');
    },
    exportJSON() { return JSON.stringify({ v: 1, db, orders: T.orders.list() }, null, 2); },
    importJSON(str) {
      const o = JSON.parse(str);
      if (!o || !o.db) throw new Error('Format file tidak valid');
      const keep = db.subscribers;
      db = merge(DEFAULTS, o.db);
      if (REMOTE) { delete db.settings.admin; db.subscribers = keep || []; }
      if (Array.isArray(o.orders)) {
        if (REMOTE) importOrders(o.orders).then(loadAdminData).then(() => notify('remote')).catch((e) => { if (T.onError) T.onError(e, 'remote'); });
        else os(o.orders);
      }
      persist(); notify('local');
    },
    size() { try { return (localStorage.getItem(KEY) || '').length + (localStorage.getItem(OKEY) || '').length; } catch (e) { return 0; } },

    /* Upload foto ke Supabase Storage → URL publik (hanya admin) */
    async uploadImage(blob) {
      if (!REMOTE || !isAdmin) throw new Error('Bukan admin');
      const path = new Date().toISOString().slice(0, 7) + '/' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) + '.jpg';
      const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', cacheControl: '31536000', upsert: false });
      if (error) throw error;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    /* Newsletter (boleh dipanggil pengunjung) */
    async subscribe(email) {
      email = String(email || '').trim().toLowerCase();
      if (!MAIL.test(email) || email.length > 254) throw new Error('Email tidak valid');
      if (!REMOTE) {
        T.update((d) => { if (d.subscribers.every((x) => x.email !== email)) d.subscribers.push({ email, time: Date.now() }); });
        return true;
      }
      const { error } = await sb.from('subscribers').insert({ email });
      if (error && error.code !== '23505') throw error; // 23505 = sudah terdaftar
      return true;
    },

    orders: {
      list: () => (REMOTE ? ordersCache : ol()),
      add(o) {
        if (!REMOTE) { const a = ol(); a.unshift(o); os(a); notify('local'); return Promise.resolve(); }
        const row = { id: String(o.id), status: 'new', total: Number(o.total) || 0, items: o.items || [] };
        return sendOrder(row).catch((e) => { console.warn('TRSH: pesanan ditunda, akan dicoba lagi', e); setPend(pend().concat([row])); });
      },
      update(id, patch) {
        if (!REMOTE) { const a = ol(); const o = a.find((x) => x.id === id); if (o) Object.assign(o, patch); os(a); notify('local'); return; }
        const o = ordersCache.find((x) => x.id === id); if (o) Object.assign(o, patch);
        const body = {}; if (patch.status && STATUSES.includes(patch.status)) body.status = patch.status;
        if (Object.keys(body).length) sb.from('orders').update(body).eq('id', id).then(({ error }) => { if (error && T.onError) T.onError(error, 'remote'); });
        notify('local');
      },
      remove(id) {
        if (!REMOTE) { os(ol().filter((x) => x.id !== id)); notify('local'); return; }
        ordersCache = ordersCache.filter((x) => x.id !== id);
        sb.from('orders').delete().eq('id', id).then(({ error }) => { if (error && T.onError) T.onError(error, 'remote'); });
        notify('local');
      },
      clear() {
        if (!REMOTE) { os([]); notify('local'); return; }
        ordersCache = [];
        sb.from('orders').delete().neq('id', '').then(({ error }) => { if (error && T.onError) T.onError(error, 'remote'); });
        notify('local');
      },
    },
    onError: null,
    onStatus: null,
  };
  w.TRSH = T;

  /* ---------- Boot ---------- */
  const ready = REMOTE
    ? fetchRemote().then(() => { listen(); return flushPending(); }).catch((e) => console.warn('TRSH:', e))
    : Promise.resolve();
  T.ready = ready;
})(window);
