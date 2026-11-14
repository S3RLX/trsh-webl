/* ==========================================================
   TRSH — storefront logic
   Semua tampilan dirender dari data TRSH (store.js) dan
   di-render ulang otomatis saat admin mengubah sesuatu.
   ========================================================== */
(() => {
  'use strict';
  const T = window.TRSH;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const D = () => T.get();
  const S = () => T.get().settings;
  const PREVIEW = new URLSearchParams(location.search).has('preview');

  const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };

  const st = {
    cat: 'all', q: '', sort: 'new', saved: false,
    cart: ls('trsh_cart', []), wish: ls('trsh_wish', []),
    open: null, size: null, qty: 1, img: 0, first: true,
  };
  const cache = new WeakMap();
  const setHTML = (el, html) => { if (!el) return false; if (cache.get(el) === html) return false; cache.set(el, html); el.innerHTML = html; return true; };

  const prod = (id) => D().products.find((p) => p.id === id);
  const catName = (id) => { const c = D().categories.find((x) => x.id === id); return c ? c.name : 'UNCATEGORIZED'; };
  const money = (n) => T.money(n);
  const imgs = (p) => (p.images && p.images.length ? p.images : [T.placeholder(p, 0), T.placeholder(p, 1)]);

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
  }

  /* ---------------- THEME ---------------- */
  let prevFlags = [];
  function applyTheme() {
    const s = S(), t = s.theme, r = document.documentElement.style;
    const map = {
      '--bg': t.bg, '--fg': t.fg, '--muted': t.muted, '--card': t.card, '--accent': t.accent, '--line': t.line,
      '--on-accent': T.contrast(t.accent), '--radius': t.radius + 'px',
      '--cols': t.gridCols, '--cols-md': Math.min(t.gridCols, 3), '--cols-sm': Math.min(t.gridCols, 2),
      '--ratio': t.ratio, '--speed': t.animSpeed,
      '--f-display': T.fontStack(t.displayFont), '--f-body': T.fontStack(t.bodyFont), '--f-mono': T.fontStack(t.monoFont, 'mono'),
    };
    Object.keys(map).forEach((k) => r.setProperty(k, map[k]));
    const url = T.fontUrl([t.displayFont, t.bodyFont, t.monoFont]);
    const link = $('#gfont');
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
    document.querySelector('meta[name=theme-color]').setAttribute('content', t.bg);
    Object.keys(s.effects).forEach((k) => document.body.classList.toggle('fx-' + k, !!s.effects[k]));
    document.body.classList.toggle('fx-wl', !!s.store.wishlist);
    $('#custom-css').textContent = s.custom.css || '';

    // custom flags -> data attributes + css variables
    prevFlags.forEach((k) => { document.body.removeAttribute('data-f-' + k); r.removeProperty('--c-' + k); });
    prevFlags = [];
    (s.custom.flags || []).forEach((f) => {
      const k = String(f.key || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!k) return;
      document.body.setAttribute('data-f-' + k, f.value);
      r.setProperty('--c-' + k, f.value);
      prevFlags.push(k);
    });
  }

  /* ---------------- CHROME (nav / announce / footer) ---------------- */
  function renderChrome() {
    const s = S();
    document.title = s.brand.fullName + ' — ' + s.brand.tagline;
    const an = $('#announce');
    an.hidden = !(s.announcement.enabled && s.announcement.text);
    an.innerHTML = '<span class="dot"></span>' + esc(s.announcement.text);
    $('#logo').innerHTML = '<span>' + esc(s.brand.name) + '</span><i>✦</i>';
    const links = [['shop', 'CATALOG'], ['drop', 'DROP'], ['about', 'ABOUT'], ['newsletter', 'JOIN']].filter((l) => s.sections[l[0]]);
    setHTML($('#links'), links.map((l) => `<a href="#${l[0]}">${l[1]}</a>`).join(''));
    $('#cartBtn').hidden = !s.store.cart;
    $('#wishBtn').hidden = !s.store.wishlist;
    $('#wishN').textContent = st.wish.length;
    $('#cartN').textContent = st.cart.reduce((a, c) => a + c.qty, 0);
    $('#plText').textContent = s.brand.fullName;
    Object.keys(s.sections).forEach((k) => { const el = $('#' + k); if (el) el.hidden = !s.sections[k]; });

    const m = $('#maint');
    const on = s.store.maintenance && !PREVIEW;
    m.hidden = !on;
    if (on) setHTML(m, `<div><p class="mono kicker">[ 503 ]</p><h2 class="chrome">${esc(s.brand.name)}</h2><p class="mono">${esc(s.store.maintenanceText)}</p></div>`);
  }

  const SPARK = '<svg viewBox="0 0 600 600" fill="none" stroke="currentColor" stroke-width="2"><path d="M300 10C312 200 400 288 590 300C400 312 312 400 300 590C288 400 200 312 10 300C200 288 288 200 300 10Z"/><path d="M300 110C308 240 360 292 490 300C360 308 308 360 300 490C292 360 240 308 110 300C240 292 292 240 300 110Z" stroke-opacity=".5"/></svg>';

  function renderHero() {
    const h = S().hero;
    let sticker = '';
    if (h.showSticker && h.sticker) {
      let tx = (h.sticker.toUpperCase() + ' ✦ '); while (tx.length < 26) tx += tx;
      sticker = `<div class="sticker"><svg viewBox="0 0 200 200"><defs><path id="cp" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text><textPath href="#cp" textLength="500" lengthAdjust="spacing">${esc(tx)}</textPath></text></svg></div>`;
    }
    setHTML($('#hero'), `
      <div class="hero-bg"><div class="spark">${SPARK}</div></div>
      <div class="hero-in">
        <p class="mono eyebrow">${esc(h.eyebrow)}</p>
        <h1 class="hero-t"><span class="gl" data-text="${esc(h.line1)}">${esc(h.line1)}</span><span class="gl chrome" data-text="${esc(h.line2)}">${esc(h.line2)}</span></h1>
        <div class="hero-row"><p class="hero-sub">${esc(h.sub)}</p><a class="btn" href="${esc(h.ctaLink)}">${esc(h.cta)} <span>↘</span></a></div>
      </div>
      ${sticker}
      <div class="hero-meta mono"><span>N°001</span><span>SCROLL ↓</span><span>${new Date().getFullYear()}</span></div>`);
  }

  function renderMarquee() {
    const m = S().marquee;
    const unit = `<span>${esc(m.text)} ✦</span>`.repeat(6);
    $('#marquee').style.setProperty('--mq', (Number(m.speed) || 28) + 's');
    setHTML($('#marquee'), `<div class="mq"><div style="display:flex">${unit}</div><div style="display:flex">${unit}</div></div>`);
  }

  function renderDrop() {
    const d = S().drop;
    setHTML($('#drop'), `
      <div><p class="mono kicker">[ 01 — ${esc(d.title)} ]</p><h2 class="chrome">${esc(d.title)}</h2><p class="note">${esc(d.note)}</p></div>
      <div class="cd" id="cd"><div><b data-u="d">00</b><small>DAYS</small></div><div><b data-u="h">00</b><small>HRS</small></div><div><b data-u="m">00</b><small>MIN</small></div><div><b data-u="s">00</b><small>SEC</small></div></div>`);
    tick();
  }
  function tick() {
    const cd = $('#cd'); if (!cd) return;
    const ts = new Date(S().drop.date).getTime();
    let diff = isNaN(ts) ? 0 : Math.max(0, ts - Date.now());
    cd.classList.toggle('live', diff === 0);
    const v = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
    $$('[data-u]', cd).forEach((b) => { b.textContent = String(v[b.dataset.u]).padStart(2, '0'); });
  }
  setInterval(tick, 1000);

  /* ---------------- SHOP ---------------- */
  function listProducts() {
    let list = D().products.filter((p) => p.active !== false);
    const hidden = D().categories.filter((c) => !c.visible).map((c) => c.id);
    list = list.filter((p) => hidden.indexOf(p.category) < 0);
    return list;
  }
  function renderShop() {
    const s = S();
    $('#shopKicker').textContent = s.shop.kicker;
    $('#shopTitle').textContent = s.shop.title;
    $('#srchWrap').hidden = !s.store.search;
    $('#sortWrap').hidden = !s.store.sort;
    const all = listProducts();
    const cats = D().categories.filter((c) => c.visible);
    if (st.cat !== 'all' && !cats.find((c) => c.id === st.cat)) st.cat = 'all';
    const chips = [`<button class="chip ${st.cat === 'all' && !st.saved ? 'on' : ''}" data-cat="all">ALL<sup>${all.length}</sup></button>`]
      .concat(cats.map((c) => `<button class="chip ${st.cat === c.id && !st.saved ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}<sup>${all.filter((p) => p.category === c.id).length}</sup></button>`));
    if (s.store.wishlist) chips.push(`<button class="chip ${st.saved ? 'on' : ''}" data-cat="__saved">♡ SAVED<sup>${st.wish.length}</sup></button>`);
    setHTML($('#chips'), chips.join(''));

    let list = all;
    if (st.saved) list = list.filter((p) => st.wish.indexOf(p.id) >= 0);
    else if (st.cat !== 'all') list = list.filter((p) => p.category === st.cat);
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter((p) => (p.name + ' ' + catName(p.category) + ' ' + (p.desc || '')).toLowerCase().indexOf(q) >= 0); }
    list = list.slice();
    if (st.sort === 'low') list.sort((a, b) => a.price - b.price);
    else if (st.sort === 'high') list.sort((a, b) => b.price - a.price);
    else if (st.sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => (b.featured - a.featured) || (b.createdAt - a.createdAt));

    $('#empty').hidden = list.length > 0;
    if (setHTML($('#grid'), list.map(card).join(''))) reveal();
  }
  function card(p, i) {
    const s = S().store, im = imgs(p), out = p.stock <= 0;
    const low = !out && s.showStock && p.stock <= s.lowStock;
    const badges = [];
    if (out) badges.push('<span class="badge out">SOLD OUT</span>');
    else if (p.badge && p.badge !== 'SOLD OUT') badges.push(`<span class="badge hot">${esc(p.badge)}</span>`);
    if (low && !(p.badge || '').match(/LOW/i)) badges.push(`<span class="badge">ONLY ${p.stock} LEFT</span>`);
    return `<article class="card rv ${out ? 'soldout' : ''}" data-id="${esc(p.id)}" style="--i:${i % 8}">
      <div class="card-media"><div class="badges">${badges.join('')}</div>
        <button class="wish ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>
        <img class="m1" src="${esc(im[0])}" alt="${esc(p.name)}" loading="lazy">${im[1] ? `<img class="m2" src="${esc(im[1])}" alt="" loading="lazy">` : ''}</div>
      <div class="card-info"><div><h3>${esc(p.name)}</h3><p class="mono cat">${esc(catName(p.category))}</p></div><p class="price">${money(p.price)}</p></div>
    </article>`;
  }

  /* ---------------- about / news / footer / extra ---------------- */
  function renderAbout() {
    const a = S().about;
    setHTML($('#about'), `<div class="rv"><p class="mono kicker">${esc(a.kicker)}</p><h2 class="chrome">${esc(a.title)}</h2></div><p class="body rv" style="--i:2">${esc(a.text)}</p>`);
    reveal();
  }
  function renderNews() {
    const f = S().footer;
    setHTML($('#newsletter'), `<div class="rv"><p class="mono kicker">[ 04 — NEWSLETTER ]</p><h2>${esc(f.newsletterTitle)}</h2><p>${esc(f.newsletterText)}</p>
      <form class="nl" id="nlForm"><input type="email" name="email" placeholder="EMAIL@KAMU.COM" required><button type="submit">SUBSCRIBE →</button></form></div>`);
    reveal();
  }
  function renderFooter() {
    const s = S(), so = s.social;
    const links = [['INSTAGRAM', so.instagram], ['TIKTOK', so.tiktok], ['EMAIL', so.email ? 'mailto:' + so.email : '']].filter((l) => l[1]);
    setHTML($('#footer'), `<div class="foot-top mono"><nav>${links.map((l) => `<a href="${esc(l[1])}" target="_blank" rel="noopener">${l[0]}</a>`).join('')}</nav><span>${esc(s.brand.tagline)}</span></div>
      <div class="wordmark chrome">${esc(s.brand.fullName)}</div>
      <div class="foot-b mono"><span>${esc(s.footer.text)}</span><a href="#top">BACK TO TOP ↑</a></div>`);
  }
  function renderExtra() {
    const el = $('#extra'), c = S().custom;
    el.hidden = !(S().sections.extra && c.extraHtml);
    setHTML(el, c.extraHtml || '');
  }

  /* ---------------- reveal on scroll ---------------- */
  let io = null;
  function reveal() {
    const els = $$('.rv:not(.in)');
    if (!els.length) return;
    if (!S().effects.reveal || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    if (!st.first) { requestAnimationFrame(() => requestAnimationFrame(() => els.forEach((e) => e.classList.add('in')))); return; }
    io = io || new IntersectionObserver((es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));
  }

  /* ---------------- product modal ---------------- */
  function openProduct(id) {
    const p = prod(id); if (!p) return;
    st.open = id; st.qty = 1; st.img = 0;
    st.size = p.sizes && p.sizes.length === 1 ? p.sizes[0] : null;
    renderModal();
    $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on');
  }
  function renderModal() {
    const p = prod(st.open);
    if (!p) { if (st.open) closeAll(); return; }
    const s = S().store, im = imgs(p), out = p.stock <= 0;
    const low = !out && s.showStock && p.stock <= s.lowStock;
    const stock = out ? '<span class="stock out">● SOLD OUT</span>' : low ? `<span class="stock low">● ONLY ${p.stock} LEFT</span>` : s.showStock ? `<span class="stock">● IN STOCK</span>` : '';
    const sizes = (p.sizes || []).map((z) => `<button class="${st.size === z ? 'on' : ''}" data-size="${esc(z)}">${esc(z)}</button>`).join('');
    setHTML($('#modal'), `<div class="md">
      <button class="x md-x" data-act="close" aria-label="Close">✕</button>
      <div class="md-g"><div class="md-main"><img src="${esc(im[st.img] || im[0])}" alt="${esc(p.name)}"></div>
        ${im.length > 1 ? `<div class="md-th">${im.map((u, i) => `<img src="${esc(u)}" data-th="${i}" class="${i === st.img ? 'on' : ''}" alt="">`).join('')}</div>` : ''}</div>
      <div class="md-i">
        <p class="mono kicker" style="margin:0">${esc(catName(p.category))}</p>
        <h2>${esc(p.name)}</h2>
        <div style="display:flex;justify-content:space-between;align-items:center"><span class="price">${money(p.price)}</span>${stock}</div>
        <p class="desc">${esc(p.desc)}</p>
        ${sizes ? `<div><div class="lab mono"><span>SIZE</span></div><div class="sz">${sizes}</div></div>` : ''}
        ${s.cart ? `<div><div class="lab mono"><span>QTY</span></div><div class="qty"><button data-q="-1">−</button><span>${st.qty}</span><button data-q="1">+</button></div></div>` : ''}
        <div class="md-act">${s.cart ? `<button class="btn solid full" data-act="add" ${out ? 'disabled' : ''}>${out ? 'SOLD OUT' : 'ADD TO BAG'} <span>+</span></button>` : ''}
          ${s.wishlist ? `<button class="wishb ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>` : ''}</div>
      </div></div>`);
  }

  /* ---------------- cart ---------------- */
  const saveCart = () => { lsSet('trsh_cart', st.cart); };
  function cartLines() {
    st.cart = st.cart.filter((c) => prod(c.pid));
    return st.cart.map((c) => ({ c, p: prod(c.pid) }));
  }
  function addCart(pid, size, qty) {
    const p = prod(pid);
    if (!p || p.stock <= 0) { toast('SOLD OUT'); return false; }
    if (p.sizes && p.sizes.length && !size) { toast('PILIH SIZE DULU'); return false; }
    const have = st.cart.filter((c) => c.pid === pid).reduce((a, c) => a + c.qty, 0);
    if (have + qty > p.stock) { toast('STOK TIDAK CUKUP'); return false; }
    const ex = st.cart.find((c) => c.pid === pid && c.size === size);
    if (ex) ex.qty += qty; else st.cart.push({ pid, size, qty });
    saveCart(); renderChrome(); renderCart(); toast('DITAMBAHKAN KE BAG ✦');
    return true;
  }
  function renderCart() {
    const lines = cartLines();
    const total = lines.reduce((a, l) => a + l.p.price * l.c.qty, 0);
    setHTML($('#drawer'), `
      <div class="dr-h"><h3>YOUR BAG (${lines.reduce((a, l) => a + l.c.qty, 0)})</h3><button class="x" data-act="close" aria-label="Close">✕</button></div>
      <div class="dr-b">${lines.length ? lines.map((l, i) => `<div class="li"><img src="${esc(imgs(l.p)[0])}" data-open="${esc(l.p.id)}" alt="">
        <div><h4>${esc(l.p.name)}</h4><p class="mono">${l.c.size ? 'SIZE ' + esc(l.c.size) : ''}</p>
        <div class="qty"><button data-cq="${i}" data-d="-1">−</button><span>${l.c.qty}</span><button data-cq="${i}" data-d="1">+</button></div></div>
        <div style="display:flex;flex-direction:column;justify-content:space-between;align-items:flex-end"><button class="rm" data-rm="${i}">REMOVE</button><span class="price">${money(l.p.price * l.c.qty)}</span></div></div>`).join('') : '<p class="dr-empty mono">— BAG IS EMPTY —</p>'}</div>
      ${lines.length ? `<div class="dr-f"><div class="tot"><span>TOTAL</span><b>${money(total)}</b></div><button class="btn solid full" data-act="checkout">CHECKOUT VIA WHATSAPP <span>→</span></button></div>` : ''}`);
  }
  function checkout() {
    const lines = cartLines(); if (!lines.length) return;
    const sh = S().store;
    const num = String(sh.whatsapp || '').replace(/\D/g, '');
    if (!num) { toast('NOMOR WHATSAPP BELUM DIATUR'); return; }
    const total = lines.reduce((a, l) => a + l.p.price * l.c.qty, 0);
    const txt = lines.map((l) => `- ${l.p.name}${l.c.size ? ' [' + l.c.size + ']' : ''} x${l.c.qty} = ${money(l.p.price * l.c.qty)}`).join('\n');
    const msg = String(sh.template || '{items}\n{total}').split('{items}').join(txt).split('{total}').join(money(total));
    T.orders.add({
      id: T.uid('ord-').toUpperCase(), time: Date.now(), status: 'new', total,
      items: lines.map((l) => ({ id: l.p.id, name: l.p.name, size: l.c.size, qty: l.c.qty, price: l.p.price })),
    });
    window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
    st.cart = []; saveCart(); renderChrome(); renderCart(); closeAll();
  }

  function openCart() { renderCart(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); }
  function closeAll() {
    st.open = null;
    $('#drawer').classList.remove('open'); $('#modal').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true'); $('#modal').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('on');
  }
  function toggleWish(id) {
    const i = st.wish.indexOf(id);
    if (i >= 0) st.wish.splice(i, 1); else { st.wish.push(id); toast('DISIMPAN ♥'); }
    lsSet('trsh_wish', st.wish);
    renderChrome(); renderShop(); if (st.open) renderModal();
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-wish]'))) { e.stopPropagation(); toggleWish(el.dataset.wish); return; }
    if ((el = t.closest('[data-cat]'))) {
      if (el.dataset.cat === '__saved') { st.saved = !st.saved; } else { st.saved = false; st.cat = el.dataset.cat; }
      renderShop(); return;
    }
    if ((el = t.closest('.card'))) { openProduct(el.dataset.id); return; }
    if ((el = t.closest('[data-open]'))) { closeAll(); setTimeout(() => openProduct(el.dataset.open), 50); return; }
    if ((el = t.closest('[data-size]'))) { st.size = el.dataset.size; renderModal(); return; }
    if ((el = t.closest('[data-th]'))) { st.img = Number(el.dataset.th); renderModal(); return; }
    if ((el = t.closest('[data-q]'))) { st.qty = Math.max(1, st.qty + Number(el.dataset.q)); renderModal(); return; }
    if ((el = t.closest('[data-cq]'))) {
      const c = st.cart[Number(el.dataset.cq)], p = c && prod(c.pid);
      if (c && p) {
        const d = Number(el.dataset.d), have = st.cart.filter((x) => x.pid === c.pid).reduce((a, x) => a + x.qty, 0);
        if (d > 0 && have >= p.stock) toast('STOK TIDAK CUKUP'); else { c.qty += d; if (c.qty <= 0) st.cart.splice(Number(el.dataset.cq), 1); }
        saveCart(); renderChrome(); renderCart();
      }
      return;
    }
    if ((el = t.closest('[data-rm]'))) { st.cart.splice(Number(el.dataset.rm), 1); saveCart(); renderChrome(); renderCart(); return; }
    if ((el = t.closest('[data-act]'))) {
      const a = el.dataset.act;
      if (a === 'cart') openCart();
      else if (a === 'wishlist') { st.saved = true; renderShop(); location.hash = '#shop'; document.getElementById('shop').scrollIntoView({ behavior: 'smooth' }); }
      else if (a === 'close') closeAll();
      else if (a === 'add') { if (addCart(st.open, st.size, st.qty)) { closeAll(); setTimeout(openCart, 250); } }
      else if (a === 'checkout') checkout();
      return;
    }
    if (t.id === 'scrim' || t.id === 'modal') closeAll();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'nlForm') {
      e.preventDefault();
      const email = String(new FormData(e.target).get('email') || '').trim();
      T.subscribe(email).then(() => toast('WELCOME TO THE NOISE ✦')).catch(() => toast('EMAIL TIDAK VALID / COBA LAGI'));
      e.target.reset();
    }
  });
  $('#q').addEventListener('input', (e) => { st.q = e.target.value.trim(); renderShop(); });
  $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; renderShop(); });

  /* card tilt */
  const grid = $('#grid');
  grid.addEventListener('mousemove', (e) => {
    if (!S().effects.tilt || !matchMedia('(pointer:fine)').matches) return;
    const m = e.target.closest('.card-media'); if (!m) return;
    const r = m.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
    m.style.transform = `perspective(800px) rotateY(${x * 7}deg) rotateX(${-y * 7}deg)`;
  });
  grid.addEventListener('mouseout', (e) => { const m = e.target.closest('.card-media'); if (m) m.style.transform = ''; });

  /* custom cursor */
  if (matchMedia('(pointer:fine)').matches) {
    const cur = $('#cursor'); let mx = 0, my = 0, cx = 0, cy = 0;
    addEventListener('mousemove', (e) => { mx = e.clientX; my = e.clientY; cur.classList.add('on'); });
    (function loop() { cx += (mx - cx) * 0.2; cy += (my - cy) * 0.2; cur.style.transform = `translate(${cx}px,${cy}px)`; requestAnimationFrame(loop); })();
    document.addEventListener('mouseover', (e) => cur.classList.toggle('hot', !!e.target.closest('a,button,.card,input,select,textarea,label')));
  }

  /* ---------------- preloader ---------------- */
  function preload() {
    const pl = $('#preloader');
    if (!S().effects.preloader || PREVIEW) { pl.remove(); document.body.classList.remove('loading'); return; }
    let n = 0; const num = $('#plNum'), bar = $('#plBar');
    const iv = setInterval(() => {
      n = Math.min(100, n + Math.ceil(Math.random() * 13));
      num.textContent = String(n).padStart(3, '0'); bar.style.width = n + '%';
      if (n >= 100) {
        clearInterval(iv);
        // tunggu data dari Supabase (maks 3,5 dtk) agar tidak sempat tampil data default
        Promise.race([T.ready, new Promise((r) => setTimeout(r, 3500))]).then(() => {
          setTimeout(() => { pl.classList.add('done'); document.body.classList.remove('loading'); setTimeout(() => pl.remove(), 900); }, 260);
        });
      }
    }, 70);
  }

  /* ---------------- render all + realtime ---------------- */
  function renderAll() {
    applyTheme(); renderChrome(); renderHero(); renderMarquee(); renderDrop();
    renderShop(); renderExtra(); renderAbout(); renderNews(); renderFooter();
    renderCart(); if (st.open) renderModal();
    reveal();
  }
  let raf = 0;
  T.on(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); });

  renderAll();
  preload();
  setTimeout(() => { st.first = false; }, 1500);
  window.addEventListener('storage', (e) => { if (e.key === 'trsh_cart') { st.cart = ls('trsh_cart', []); renderChrome(); renderCart(); } });
})();
