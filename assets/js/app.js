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
  const L = (k, v) => T.L(k, v);
  const PREVIEW = new URLSearchParams(location.search).has('preview');

  const ls = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const ss = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} };

  const st = {
    cat: 'all', q: '', sort: 'new', sortTouched: false, saved: false, page: 1,
    cart: ls('trsh_cart', []), wish: ls('trsh_wish', []), voucher: ls('trsh_voucher', ''), vInput: null,
    open: null, size: null, qty: 1, img: 0, first: true, adjusted: false, lastFocus: null,
  };
  const cache = new WeakMap();
  const setHTML = (el, html) => { if (!el) return false; if (cache.get(el) === html) return false; cache.set(el, html); el.innerHTML = html; return true; };

  const prod = (id) => D().products.find((p) => p.id === id);
  const catName = (id) => { const c = D().categories.find((x) => x.id === id); return c ? c.name : 'UNCATEGORIZED'; };
  const money = (n) => T.money(n);
  const imgs = (p) => (p.images && p.images.length ? p.images : [T.placeholder(p, 0), T.placeholder(p, 1)]);
  const limitOf = (p) => { const m = Number(S().store.maxPerItem) || 0; return m > 0 ? Math.min(p.stock, m) : p.stock; };

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }
  const lock = () => document.body.classList.toggle('locked', !!(st.open || $('#drawer').classList.contains('open') || $('#popup').classList.contains('open')));

  /* ---------------- tracking (opsional: GA4 / Meta Pixel) ---------------- */
  let trackOn = false;
  function initTracking() {
    if (trackOn || PREVIEW) return;
    const t = S().tracking || {};
    if (/^G-[A-Z0-9]{4,}$/.test(t.ga || '')) {
      const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + t.ga; document.head.appendChild(s);
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date()); window.gtag('config', t.ga); trackOn = true;
    }
    if (/^\d{8,20}$/.test(t.pixel || '')) {
      /* eslint-disable */
      !function (f, b, e, v, n, t2, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t2 = b.createElement(e); t2.async = !0; t2.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t2, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      /* eslint-enable */
      window.fbq('init', t.pixel); window.fbq('track', 'PageView'); trackOn = true;
    }
  }
  function track(ev, data) {
    if (!trackOn || PREVIEW) return;
    try {
      const map = { add: ['add_to_cart', 'AddToCart'], checkout: ['begin_checkout', 'InitiateCheckout'] }[ev];
      if (window.gtag && map) window.gtag('event', map[0], data || {});
      if (window.fbq && map) window.fbq('track', map[1], data || {});
    } catch (e) {}
  }

  /* ---------------- THEME + SEO ---------------- */
  let prevFlags = [];
  function applyTheme() {
    const s = S(), t = s.theme, r = document.documentElement.style, b = document.body.classList;
    const map = {
      '--bg': t.bg, '--fg': t.fg, '--muted': t.muted, '--card': t.card, '--accent': t.accent, '--line': t.line,
      '--on-accent': T.contrast(t.accent), '--radius': t.radius + 'px',
      '--cols': t.gridCols, '--cols-md': Math.min(t.gridCols, 3), '--cols-sm': Math.min(t.gridCols, 2),
      '--ratio': t.ratio, '--speed': t.animSpeed, '--fs': t.fontScale || 1,
      '--maxw': Number(t.maxWidth) > 0 ? t.maxWidth + 'px' : '99999px',
      '--f-display': T.fontStack(t.displayFont), '--f-body': T.fontStack(t.bodyFont), '--f-mono': T.fontStack(t.monoFont, 'mono'),
    };
    Object.keys(map).forEach((k) => r.setProperty(k, map[k]));
    const url = T.fontUrl([t.displayFont, t.bodyFont, t.monoFont]);
    const link = $('#gfont');
    if (link.getAttribute('href') !== url) link.setAttribute('href', url);
    document.querySelector('meta[name=theme-color]').setAttribute('content', t.bg);
    Object.keys(s.effects).forEach((k) => b.toggle('fx-' + k, !!s.effects[k]));
    document.documentElement.classList.toggle('smooth', s.effects.smooth !== false);
    b.toggle('fx-wl', !!s.store.wishlist);
    b.toggle('shape-pill', t.btnShape === 'pill');
    b.toggle('card-bordered', t.cardStyle === 'bordered');
    b.toggle('card-flat', t.cardStyle === 'flat');
    b.toggle('img-contain', t.imgFit === 'contain');
    b.toggle('nav-static', t.navSticky === false);
    $('#custom-css').textContent = s.custom.css || '';

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
  function applySeo() {
    const s = S(), seo = s.seo || {};
    const title = seo.title || (s.brand.fullName + ' — ' + s.brand.tagline);
    const desc = seo.description || s.hero.sub || '';
    document.title = title;
    document.documentElement.lang = seo.lang || 'id';
    const set = (sel, attr, v) => { const el = $(sel); if (el && el.getAttribute(attr) !== v) el.setAttribute(attr, v); };
    set('meta[name=description]', 'content', desc);
    set('meta[property="og:title"]', 'content', title);
    set('meta[property="og:description"]', 'content', desc);
    set('meta[name="twitter:title"]', 'content', title);
    set('meta[name="twitter:description"]', 'content', desc);
    const img = T.safeUrl(seo.image);
    if (img) { set('meta[property="og:image"]', 'content', img); set('meta[name="twitter:image"]', 'content', img); }
    if (seo.favicon) {
      const f = T.safeUrl(seo.favicon);
      const href = f && /[/.]/.test(f) ? f : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="18" fill="' + s.theme.bg + '"/><text x="50" y="68" font-size="58" text-anchor="middle" fill="' + s.theme.accent + '">' + esc(String(seo.favicon).slice(0, 2)) + '</text></svg>');
      set('link[rel=icon]', 'href', href);
    }
  }

  /* ---------------- helpers: harga ---------------- */
  function priceHTML(p, big) {
    const x = T.pricing(p), sh = S().store;
    if (!x.on) return `<span class="price${big ? ' big' : ''}">${money(p.price)}</span>`;
    return `<span class="price sale${big ? ' big' : ''}"><b>${money(x.price)}</b>${sh.showStrike ? `<s>${money(x.orig)}</s>` : ''}</span>`;
  }
  function saleBadge(x) {
    const m = S().store.discountBadge;
    if (!x.on || m === 'none') return '';
    const t = m === 'amount' ? '−' + money(x.save) : m === 'label' ? L('sale') : '−' + x.pct + '%';
    return `<span class="badge sale">${esc(t)}</span>`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  function left(ms) {
    ms = Math.max(0, ms);
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    return (d ? d + 'D ' : '') + pad(h) + ':' + pad(m) + ':' + pad(s);
  }

  /* ---------------- CHROME (nav / announce / promo / footer) ---------------- */
  function renderChrome() {
    const s = S();
    const an = $('#announce'), a = s.announcement;
    const dismissed = !PREVIEW && a.dismissible && ss('trsh_an_x') === a.text;
    an.hidden = !(a.enabled && a.text) || dismissed;
    an.className = 'announce mono an-' + (a.style || 'accent');
    const link = T.safeUrl(a.link);
    setHTML(an, `<span class="dot"></span>${link ? `<a href="${esc(link)}">${esc(a.text)}</a>` : esc(a.text)}${a.dismissible ? '<button class="an-x" data-act="an-close" aria-label="Tutup">✕</button>' : ''}`);

    renderPromoBar();
    $('#logo').innerHTML = '<span>' + esc(s.brand.name) + '</span><i>✦</i>';
    const names = { shop: L('navShop'), drop: L('navDrop'), about: L('navAbout'), newsletter: L('navJoin') };
    const links = T.sectionOrder().filter((k) => names[k] && s.sections[k]).map((k) => [k, names[k]]);
    setHTML($('#links'), links.map((l) => `<a href="#${l[0]}">${esc(l[1])}</a>`).join(''));
    $('#menuBtn').hidden = !links.length;
    $('#cartBtn').innerHTML = esc(L('bag')) + ' <b id="cartN">' + st.cart.reduce((x, c) => x + c.qty, 0) + '</b>';
    $('#cartBtn').hidden = !s.store.cart;
    $('#wishBtn').hidden = !s.store.wishlist;
    $('#wishN').textContent = st.wish.length;
    const plt = $('#plText'); if (plt) plt.textContent = s.brand.fullName; // preloader dihapus setelah selesai
    Object.keys(s.sections).forEach((k) => { const el = $('#' + k); if (el) el.hidden = !s.sections[k]; });
    T.sectionOrder().forEach((k, i) => { const el = $('#' + k); if (el) el.style.order = i; });

    const m = $('#maint');
    const on = s.store.maintenance && !PREVIEW;
    m.hidden = !on;
    if (on) setHTML(m, `<div><p class="mono kicker">[ 503 ]</p><h2 class="chrome">${esc(s.brand.name)}</h2><p class="mono">${esc(s.store.maintenanceText)}</p></div>`);

    // tombol WhatsApp melayang
    const wa = $('#waFloat'), num = T.waNumber(s.store.whatsapp);
    wa.hidden = !(s.store.waFloat && num.length >= 8);
    wa.classList.toggle('left', s.store.waFloatPos === 'left');
    document.body.classList.toggle('has-wa', !wa.hidden && s.store.waFloatPos !== 'left');
    if (!wa.hidden) {
      wa.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(s.store.waFloatMsg || '');
      const lbl = '<i>✆</i><span>' + esc(s.store.waFloatText || 'CHAT') + '</span>';
      if (wa.innerHTML !== lbl) wa.innerHTML = lbl;
    }
  }
  function renderPromoBar() {
    const pr = S().promo || {}, ps = T.promoState(), el = $('#promo');
    el.hidden = !(ps.on && pr.banner);
    if (el.hidden) return;
    const off = pr.type === 'amount' ? '−' + money(pr.value) : '−' + (Number(pr.value) || 0) + '%';
    const scope = pr.scope === 'cats' && (pr.cats || []).length ? ' · ' + (pr.cats || []).map(catName).join(', ') : '';
    setHTML(el, `<b>${esc(pr.label || 'SALE')}</b> <span class="off">${esc(off)}</span>${pr.bannerText ? ' · ' + esc(pr.bannerText) : ''}${esc(scope)}${ps.end ? ` · <span class="cdn" data-end="${ps.end}">${left(ps.end - Date.now())}</span>` : ''}`);
  }

  const SPARK = '<svg viewBox="0 0 600 600" fill="none" stroke="currentColor" stroke-width="2"><path d="M300 10C312 200 400 288 590 300C400 312 312 400 300 590C288 400 200 312 10 300C200 288 288 200 300 10Z"/><path d="M300 110C308 240 360 292 490 300C360 308 308 360 300 490C292 360 240 308 110 300C240 292 292 240 300 110Z" stroke-opacity=".5"/></svg>';

  function socialHTML(cls) {
    const c = S().socialCfg || {}, links = T.socialLinks();
    if (!links.length) return '';
    return `<nav class="${cls}">${links.map((l) => `<a href="${esc(l.href)}" ${c.newTab !== false && !/^mailto:/i.test(l.href) ? 'target="_blank" rel="noopener noreferrer"' : ''}>${esc(l.label)}</a>`).join('')}</nav>`;
  }
  function renderHero() {
    const s = S(), h = s.hero;
    let sticker = '';
    if (h.showSticker && h.sticker) {
      let tx = (h.sticker.toUpperCase() + ' ✦ '); while (tx.length < 26) tx += tx;
      sticker = `<div class="sticker"><svg viewBox="0 0 200 200"><defs><path id="cp" d="M100,100 m-80,0 a80,80 0 1,1 160,0 a80,80 0 1,1 -160,0"/></defs><text><textPath href="#cp" textLength="500" lengthAdjust="spacing">${esc(tx)}</textPath></text></svg></div>`;
    }
    const cta = T.safeUrl(h.ctaLink) || '#shop';
    setHTML($('#hero'), `
      <div class="hero-bg"><div class="spark">${SPARK}</div></div>
      <div class="hero-in">
        <p class="mono eyebrow">${esc(h.eyebrow)}</p>
        <h1 class="hero-t"><span class="gl" data-text="${esc(h.line1)}">${esc(h.line1)}</span><span class="gl chrome" data-text="${esc(h.line2)}">${esc(h.line2)}</span></h1>
        <div class="hero-row"><p class="hero-sub">${esc(h.sub)}</p>${h.cta ? `<a class="btn" href="${esc(cta)}">${esc(h.cta)} <span>↘</span></a>` : ''}</div>
        ${(s.socialCfg || {}).hero ? socialHTML('hero-soc mono') : ''}
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
    const diff = isNaN(ts) ? 0 : Math.max(0, ts - Date.now());
    cd.classList.toggle('live', diff === 0);
    const v = { d: Math.floor(diff / 864e5), h: Math.floor(diff / 36e5) % 24, m: Math.floor(diff / 6e4) % 60, s: Math.floor(diff / 1e3) % 60 };
    $$('[data-u]', cd).forEach((b) => { b.textContent = pad(v[b.dataset.u]); });
  }
  // satu ticker: countdown drop, countdown promo, dan deteksi harga berubah (diskon mulai/berakhir)
  let sig = '';
  const pricingSig = () => D().products.map((p) => { const x = T.pricing(p); return x.price + (x.on ? '*' : ''); }).join(',') + '|' + (T.promoState().on ? 1 : 0);
  setInterval(() => {
    tick();
    $$('[data-end]').forEach((el) => { el.textContent = left(Number(el.dataset.end) - Date.now()); });
    const n = pricingSig();
    if (sig && n !== sig) { sig = n; renderAll(); } else sig = n;
  }, 1000);

  /* ---------------- SHOP ---------------- */
  function listProducts() {
    let list = D().products.filter((p) => p.active !== false);
    const hidden = D().categories.filter((c) => !c.visible).map((c) => c.id);
    list = list.filter((p) => hidden.indexOf(p.category) < 0);
    if (S().store.soldOut === 'hide') list = list.filter((p) => p.stock > 0);
    return list;
  }
  function renderShop() {
    const s = S();
    $('#shopKicker').textContent = s.shop.kicker;
    $('#shopTitle').textContent = s.shop.title;
    $('#srchWrap').hidden = !s.store.search;
    $('#sortWrap').hidden = !s.store.sort;
    $('#srchLabel').textContent = L('search');
    $('#q').placeholder = L('searchPh');
    const sort = st.sortTouched ? st.sort : (s.store.defaultSort || 'new');
    const sortSel = $('#sort');
    setHTML(sortSel, [['new', 'newest'], ['low', 'priceLow'], ['high', 'priceHigh'], ['az', 'az']].map((o) => `<option value="${o[0]}">${esc(L(o[1]))}</option>`).join(''));
    sortSel.value = sort;

    const all = listProducts();
    const onSale = all.filter((p) => T.pricing(p).on);
    const cats = D().categories.filter((c) => c.visible);
    if (st.cat === '__sale' && (!s.store.saleChip || !onSale.length)) st.cat = 'all';
    if (st.cat !== 'all' && st.cat !== '__sale' && !cats.find((c) => c.id === st.cat)) st.cat = 'all';
    const on = (k) => st.cat === k && !st.saved;
    const chips = [`<button class="chip ${on('all') ? 'on' : ''}" data-cat="all">${esc(L('all'))}<sup>${all.length}</sup></button>`];
    if (s.store.saleChip && onSale.length) chips.push(`<button class="chip sale ${on('__sale') ? 'on' : ''}" data-cat="__sale">✦ ${esc(L('sale'))}<sup>${onSale.length}</sup></button>`);
    cats.forEach((c) => chips.push(`<button class="chip ${on(c.id) ? 'on' : ''}" data-cat="${esc(c.id)}">${esc(c.name)}<sup>${all.filter((p) => p.category === c.id).length}</sup></button>`));
    if (s.store.wishlist) chips.push(`<button class="chip ${st.saved ? 'on' : ''}" data-cat="__saved">♡ ${esc(L('saved'))}<sup>${st.wish.length}</sup></button>`);
    setHTML($('#chips'), chips.join(''));

    let list = all;
    if (st.saved) list = list.filter((p) => st.wish.indexOf(p.id) >= 0);
    else if (st.cat === '__sale') list = onSale;
    else if (st.cat !== 'all') list = list.filter((p) => p.category === st.cat);
    if (st.q) { const q = st.q.toLowerCase(); list = list.filter((p) => (p.name + ' ' + catName(p.category) + ' ' + (p.desc || '') + ' ' + (p.sku || '')).toLowerCase().indexOf(q) >= 0); }
    const eff = (p) => T.pricing(p).price;
    list = list.slice();
    if (sort === 'low') list.sort((a, b) => eff(a) - eff(b));
    else if (sort === 'high') list.sort((a, b) => eff(b) - eff(a));
    else if (sort === 'az') list.sort((a, b) => a.name.localeCompare(b.name));
    else list.sort((a, b) => (b.featured - a.featured) || (b.createdAt - a.createdAt));
    if (s.store.soldOut === 'last') list = list.filter((p) => p.stock > 0).concat(list.filter((p) => p.stock <= 0));

    const per = Number(s.store.perPage) || 0;
    const shown = per > 0 ? list.slice(0, per * st.page) : list;
    $('#empty').textContent = L('noResult');
    $('#empty').hidden = list.length > 0;
    setHTML($('#more'), per > 0 && shown.length < list.length ? `<button class="btn" data-act="more">${esc(L('loadMore'))} <span>↓</span></button><p class="mono">${shown.length} / ${list.length}</p>` : '');
    if (setHTML($('#grid'), shown.map(card).join(''))) reveal();
  }
  function card(p, i) {
    const s = S().store, im = imgs(p), out = p.stock <= 0, x = T.pricing(p);
    const low = !out && s.showStock && p.stock <= s.lowStock;
    const badges = [];
    if (out) badges.push(`<span class="badge out">${esc(L('soldOut'))}</span>`);
    else {
      const sb = saleBadge(x); if (sb) badges.push(sb);
      if (p.badge && p.badge !== 'SOLD OUT') badges.push(`<span class="badge hot">${esc(p.badge)}</span>`);
    }
    if (low && !(p.badge || '').match(/LOW/i)) badges.push(`<span class="badge">${esc(L('onlyLeft', { n: p.stock }))}</span>`);
    return `<article class="card rv ${out ? 'soldout' : ''}" data-id="${esc(p.id)}" style="--i:${i % 8}" tabindex="0" role="button" aria-label="${esc(p.name)}">
      <div class="card-media"><div class="badges">${badges.join('')}</div>
        <button class="wish ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save" tabindex="-1">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>
        <img class="m1" src="${esc(im[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async">${im[1] ? `<img class="m2" src="${esc(im[1])}" alt="" loading="lazy" decoding="async">` : ''}</div>
      <div class="card-info"><div><h3>${esc(p.name)}</h3><p class="mono cat">${esc(catName(p.category))}</p></div>${priceHTML(p)}</div>
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
      <form class="nl" id="nlForm"><input type="email" name="email" placeholder="${esc(L('emailPh'))}" aria-label="Email" required><button type="submit">${esc(L('subscribe'))}</button></form></div>`);
    reveal();
  }
  function renderFooter() {
    const s = S();
    const fl = (s.socialCfg || {}).footer !== false;
    setHTML($('#footer'), `<div class="foot-top mono">${fl ? socialHTML('foot-soc') : '<span></span>'}<span>${esc(s.brand.tagline)}</span></div>
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
    st.lastFocus = document.activeElement;
    st.open = id; st.qty = 1; st.img = 0;
    st.size = p.sizes && p.sizes.length === 1 ? p.sizes[0] : null;
    renderModal();
    $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on'); lock();
    setTimeout(() => { const x = $('#modal .md-x'); if (x) x.focus({ preventScroll: true }); }, 60);
  }
  function renderModal() {
    const p = prod(st.open);
    if (!p) { if (st.open) closeAll(); return; }
    const s = S().store, im = imgs(p), out = p.stock <= 0, x = T.pricing(p);
    const low = !out && s.showStock && p.stock <= s.lowStock;
    const stock = out ? `<span class="stock out">● ${esc(L('soldOut'))}</span>` : low ? `<span class="stock low">● ${esc(L('onlyLeft', { n: p.stock }))}</span>` : s.showStock ? `<span class="stock">● ${esc(L('inStock'))}</span>` : '';
    const sizes = (p.sizes || []).map((z) => `<button class="${st.size === z ? 'on' : ''}" data-size="${esc(z)}">${esc(z)}</button>`).join('');
    const lim = limitOf(p);
    st.qty = Math.min(Math.max(1, st.qty), Math.max(1, lim));
    const closed = s.ordering === false;
    setHTML($('#modal'), `<div class="md" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
      <button class="x md-x" data-act="close" aria-label="Close">✕</button>
      <div class="md-g"><div class="md-main"><div class="badges">${out ? '' : saleBadge(x)}</div><img src="${esc(im[st.img] || im[0])}" alt="${esc(p.name)}"></div>
        ${im.length > 1 ? `<div class="md-th">${im.map((u, i) => `<img src="${esc(u)}" data-th="${i}" class="${i === st.img ? 'on' : ''}" alt="">`).join('')}</div>` : ''}</div>
      <div class="md-i">
        <p class="mono kicker" style="margin:0">${esc(catName(p.category))}${p.sku ? ` · <span class="dim">SKU ${esc(p.sku)}</span>` : ''}</p>
        <h2>${esc(p.name)}</h2>
        <div class="md-price"><div class="pb">${priceHTML(p, true)}${x.on && s.showSavings ? `<span class="save mono">${esc(L('youSave'))} ${money(x.save)} (−${x.pct}%)</span>` : ''}</div>${stock}</div>
        ${x.on && x.end ? `<p class="sale-end mono">⏱ <span data-end="${x.end}">${left(x.end - Date.now())}</span></p>` : ''}
        <p class="desc">${esc(p.desc)}</p>
        ${sizes ? `<div><div class="lab mono"><span>${esc(L('size'))}</span></div><div class="sz">${sizes}</div></div>` : ''}
        ${s.cart ? `<div><div class="lab mono"><span>${esc(L('qty'))}</span>${Number(s.maxPerItem) > 0 ? `<span>MAKS ${lim}</span>` : ''}</div><div class="qty"><button data-q="-1" aria-label="−">−</button><span>${st.qty}</span><button data-q="1" aria-label="+">+</button></div></div>` : ''}
        ${closed ? `<p class="mono closed-note">${esc(s.closedText)}</p>` : ''}
        <div class="md-act">${s.cart ? `<button class="btn solid full" data-act="add" ${out ? 'disabled' : ''}>${out ? esc(L('soldOut')) : esc(L('addToBag'))} <span>+</span></button>` : ''}
          ${s.wishlist ? `<button class="wishb ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>` : ''}</div>
      </div></div>`);
  }

  /* ---------------- cart ---------------- */
  const saveCart = () => { lsSet('trsh_cart', st.cart); };
  // buang produk yang sudah dihapus & sesuaikan qty dengan stok terbaru
  function cartLines() {
    let changed = false;
    const used = {};
    const kept = [];
    st.cart.forEach((c) => {
      const p = prod(c.pid);
      if (!p || p.active === false || p.stock <= 0) { changed = true; return; }
      const room = limitOf(p) - (used[c.pid] || 0);
      const q = Math.min(c.qty, room);
      if (q <= 0) { changed = true; return; }
      if (q !== c.qty) { c.qty = q; changed = true; }
      used[c.pid] = (used[c.pid] || 0) + q;
      kept.push(c);
    });
    if (changed) { st.cart = kept; saveCart(); st.adjusted = true; }
    return st.cart.map((c) => ({ c, p: prod(c.pid), x: T.pricing(prod(c.pid)) }));
  }
  function voucherState(sub) {
    const code = String(st.voucher || '').trim().toUpperCase();
    const r = { code, ok: false, disc: 0, ship: false, msg: '' };
    if (!code) return r;
    const v = (S().vouchers || []).find((x) => String(x.code || '').trim().toUpperCase() === code);
    if (!v || v.active === false) { r.msg = 'KODE TIDAK VALID'; return r; }
    const exp = v.expires ? new Date(v.expires).getTime() : NaN;
    if (!isNaN(exp) && Date.now() > exp) { r.msg = 'KODE SUDAH KEDALUWARSA'; return r; }
    if (Number(v.minSpend) > 0 && sub < Number(v.minSpend)) { r.msg = 'MIN. BELANJA ' + money(v.minSpend); return r; }
    r.ok = true;
    const val = Number(v.value) || 0;
    if (v.type === 'ship') { r.ship = true; r.msg = 'GRATIS ONGKIR ✓'; }
    else {
      let d = v.type === 'amount' ? Math.round(val) : Math.round(sub * Math.min(Math.max(val, 0), 100) / 100);
      if (v.type !== 'amount' && Number(v.maxDiscount) > 0) d = Math.min(d, Number(v.maxDiscount));
      r.disc = Math.max(0, Math.min(sub, d)); r.msg = 'HEMAT ' + money(r.disc) + ' ✓';
    }
    return r;
  }
  function calc() {
    const lines = cartLines(), sh = S().store;
    let sub = 0, orig = 0, qty = 0;
    lines.forEach((l) => { l.line = l.x.price * l.c.qty; sub += l.line; orig += l.x.orig * l.c.qty; qty += l.c.qty; });
    const v = voucherState(sub), after = Math.max(0, sub - v.disc);
    const fee = Math.max(0, Number(sh.shipFee) || 0), min = Math.max(0, Number(sh.freeShipMin) || 0);
    const free = v.ship || (min > 0 && after >= min);
    const shipping = fee > 0 && !free ? fee : 0;
    return { lines, sub, orig, itemSave: orig - sub, v, after, fee, min, free, shipping, total: after + shipping, qty };
  }
  function addCart(pid, size, qty) {
    const p = prod(pid);
    if (!p || p.stock <= 0) { toast(L('soldOut')); return false; }
    if (p.sizes && p.sizes.length && !size) { toast('PILIH ' + L('size') + ' DULU'); return false; }
    const have = st.cart.filter((c) => c.pid === pid).reduce((a, c) => a + c.qty, 0);
    if (have + qty > limitOf(p)) { toast(limitOf(p) < p.stock ? 'MAKS. ' + limitOf(p) + ' PER PRODUK' : 'STOK TIDAK CUKUP'); return false; }
    const ex = st.cart.find((c) => c.pid === pid && c.size === size);
    if (ex) ex.qty += qty; else st.cart.push({ pid, size, qty });
    saveCart(); renderChrome(); renderCart(); toast(L('added'));
    track('add', { currency: 'IDR', value: T.pricing(p).price * qty, items: [{ item_id: p.id, item_name: p.name, quantity: qty }] });
    return true;
  }
  function renderCart() {
    const c = calc(), sh = S().store, closed = sh.ordering === false;
    const belowMin = Number(sh.minOrder) > 0 && c.after < Number(sh.minOrder);
    const lineHTML = (l, i) => `<div class="li"><img src="${esc(imgs(l.p)[0])}" data-open="${esc(l.p.id)}" alt="">
        <div><h4>${esc(l.p.name)}</h4><p class="mono">${l.c.size ? esc(L('size')) + ' ' + esc(l.c.size) : ''}</p>
        <div class="qty"><button data-cq="${i}" data-d="-1" aria-label="−">−</button><span>${l.c.qty}</span><button data-cq="${i}" data-d="1" aria-label="+">+</button></div></div>
        <div class="li-r"><button class="rm" data-rm="${i}">${esc(L('remove'))}</button><span class="price${l.x.on ? ' sale' : ''}"><b>${money(l.line)}</b>${l.x.on && sh.showStrike ? `<s>${money(l.x.orig * l.c.qty)}</s>` : ''}</span></div></div>`;
    const ship = c.min > 0 ? (c.free ? `<p class="ship ok mono">✓ ${esc(L('shipping'))} ${esc(L('free'))}</p>` : `<div class="ship"><p class="mono">TAMBAH ${money(c.min - c.after)} LAGI UNTUK ${esc(L('shipping'))} ${esc(L('free'))}</p><i><u style="width:${Math.min(100, Math.round(c.after / c.min * 100))}%"></u></i></div>`) : '';
    const rows = [];
    if (c.itemSave > 0 || c.v.disc > 0 || c.fee > 0) rows.push(`<div class="row"><span>${esc(L('subtotal'))}</span><span>${money(c.orig)}</span></div>`);
    if (c.itemSave > 0) rows.push(`<div class="row ok"><span>DISKON PRODUK</span><span>−${money(c.itemSave)}</span></div>`);
    if (c.v.disc > 0) rows.push(`<div class="row ok"><span>VOUCHER ${esc(c.v.code)}</span><span>−${money(c.v.disc)}</span></div>`);
    if (c.fee > 0) rows.push(`<div class="row"><span>${esc(L('shipping'))}</span><span>${c.shipping ? money(c.shipping) : esc(L('free'))}</span></div>`);
    const vbox = sh.voucherBox ? `<div class="vbox"><div class="vrow"><input id="vIn" placeholder="${esc(L('voucher'))}" value="${esc(st.vInput != null ? st.vInput : st.voucher)}" autocomplete="off" spellcheck="false"><button data-act="vapply">${esc(L('apply'))}</button></div>${c.v.code ? `<p class="mono vmsg ${c.v.ok ? 'ok' : 'bad'}">${esc(c.v.msg)}${c.v.ok ? '' : ''} <button data-act="vclear" class="lnk">✕</button></p>` : ''}</div>` : '';
    setHTML($('#drawer'), `
      <div class="dr-h"><h3>${esc(L('yourBag'))} (${c.qty})</h3><button class="x" data-act="close" aria-label="Close">✕</button></div>
      <div class="dr-b">${st.adjusted ? '<p class="mono notice">STOK BERUBAH — KERANJANG DISESUAIKAN</p>' : ''}${c.lines.length ? c.lines.map(lineHTML).join('') : `<p class="dr-empty mono">${esc(L('bagEmpty'))}</p>`}</div>
      ${c.lines.length ? `<div class="dr-f">${ship}${vbox}<div class="sum">${rows.join('')}</div><div class="tot"><span>${esc(L('total'))}</span><b>${money(c.total)}</b></div>
        ${closed ? `<p class="mono closed-note">${esc(sh.closedText)}</p>` : belowMin ? `<p class="mono closed-note">MIN. ORDER ${money(sh.minOrder)}</p>` : ''}
        ${sh.shipNote ? `<p class="mono dim">${esc(sh.shipNote)}</p>` : ''}
        <button class="btn solid full" data-act="checkout" ${closed || belowMin ? 'disabled' : ''}>${esc(L('checkout'))} <span>→</span></button></div>` : ''}`);
  }
  function checkout() {
    const sh = S().store;
    if (sh.ordering === false) { toast(sh.closedText); return; }
    const c = calc(); if (!c.lines.length) return;
    if (Number(sh.minOrder) > 0 && c.after < Number(sh.minOrder)) { toast('MIN. ORDER ' + money(sh.minOrder)); return; }
    const num = T.waNumber(sh.whatsapp);
    if (num.length < 8) { toast('NOMOR WHATSAPP BELUM DIATUR'); return; }
    const id = T.uid('ord-').toUpperCase();
    const txt = c.lines.map((l) => `- ${l.p.name}${l.c.size ? ' [' + l.c.size + ']' : ''} x${l.c.qty} = ${money(l.line)}${l.x.on ? ` (diskon ${l.x.pct}%)` : ''}`).join('\n');
    const sum = [];
    if (c.itemSave > 0 || c.v.disc > 0 || c.fee > 0) sum.push('Subtotal: ' + money(c.orig));
    if (c.itemSave > 0) sum.push('Diskon produk: -' + money(c.itemSave));
    if (c.v.disc > 0) sum.push('Voucher ' + c.v.code + ': -' + money(c.v.disc));
    if (c.fee > 0) sum.push('Ongkir: ' + (c.shipping ? money(c.shipping) : 'GRATIS'));
    const sumText = sum.join('\n');
    let tpl = String(sh.template || '{items}\n{summary}\nTotal: {total}');
    if (tpl.indexOf('{summary}') < 0 && sumText) tpl = tpl.split('{items}').join('{items}\n' + sumText);
    if (!sumText) tpl = tpl.split('{summary}\n').join('').split('{summary}').join('');
    const msg = tpl.split('{items}').join(txt).split('{summary}').join(sumText)
      .split('{subtotal}').join(money(c.sub)).split('{discount}').join(money(c.itemSave + c.v.disc))
      .split('{shipping}').join(c.shipping ? money(c.shipping) : L('free')).split('{voucher}').join(c.v.ok ? c.v.code : '-')
      .split('{orderId}').join(id).split('{total}').join(money(c.total));
    T.orders.add({
      id, time: Date.now(), status: 'new', total: c.total,
      items: c.lines.map((l) => ({ id: l.p.id, name: l.p.name, size: l.c.size, qty: l.c.qty, price: l.x.price, orig: l.x.orig })),
      meta: { subtotal: c.orig, itemDiscount: c.itemSave, voucher: c.v.ok ? c.v.code : '', voucherDiscount: c.v.disc, shipping: c.shipping },
    });
    track('checkout', { currency: 'IDR', value: c.total });
    const w = window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
    if (!w) location.href = 'https://wa.me/' + num + '?text=' + encodeURIComponent(msg); // popup diblokir (mis. beberapa browser mobile)
    st.cart = []; st.voucher = ''; st.vInput = null; lsSet('trsh_voucher', ''); saveCart(); renderChrome(); renderCart(); closeAll();
  }

  function openCart() {
    st.lastFocus = document.activeElement; st.adjusted = false;
    renderCart(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); lock();
  }
  function closeAll() {
    st.open = null;
    $('#drawer').classList.remove('open'); $('#modal').classList.remove('open'); $('#popup').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true'); $('#modal').setAttribute('aria-hidden', 'true'); $('#popup').setAttribute('aria-hidden', 'true');
    $('#scrim').classList.remove('on'); lock();
    if (st.lastFocus && st.lastFocus.focus) { try { st.lastFocus.focus({ preventScroll: true }); } catch (e) {} st.lastFocus = null; }
  }
  function toggleWish(id) {
    const i = st.wish.indexOf(id);
    if (i >= 0) st.wish.splice(i, 1); else { st.wish.push(id); toast('DISIMPAN ♥'); }
    lsSet('trsh_wish', st.wish);
    renderChrome(); renderShop(); if (st.open) renderModal();
  }
  function applyVoucher() {
    const v = String(($('#vIn') || {}).value || '').trim().toUpperCase();
    st.voucher = v; st.vInput = null; lsSet('trsh_voucher', v); renderCart();
  }

  /* ---------------- popup promo ---------------- */
  let popupShown = false;
  function maybePopup() {
    const p = S().popup || {};
    if (popupShown || !p.enabled || (!p.title && !p.text)) return;
    const key = 'trsh_popup';
    if (!PREVIEW) {
      if (p.frequency === 'once' && ls(key, '')) return;
      if (p.frequency !== 'always' && p.frequency !== 'once' && ss(key)) return;
    }
    popupShown = true;
    setTimeout(() => {
      const q = S().popup || {};
      if (!q.enabled || S().store.maintenance && !PREVIEW) return;
      renderPopup();
      $('#popup').classList.add('open'); $('#popup').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); lock();
      if (!PREVIEW) { ssSet(key, '1'); lsSet(key, '1'); }
    }, Math.max(0, Number(p.delay) || 0) * 1000);
  }
  function renderPopup() {
    const p = S().popup || {}, link = T.safeUrl(p.link);
    setHTML($('#popup'), `<div class="pp" role="dialog" aria-modal="true"><button class="x" data-act="close" aria-label="Close">✕</button>
      <p class="mono kicker">[ ✦ ]</p><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>
      ${p.code ? `<button class="code mono" data-act="usecode" data-code="${esc(p.code)}">${esc(p.code)} <span>PAKAI KODE</span></button>` : ''}
      ${p.cta ? `<a class="btn solid full" href="${esc(link || '#shop')}" data-act="close">${esc(p.cta)} <span>→</span></a>` : ''}</div>`);
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', (e) => {
    const t = e.target;
    let el;
    if ((el = t.closest('[data-wish]'))) { e.stopPropagation(); toggleWish(el.dataset.wish); return; }
    if ((el = t.closest('[data-cat]'))) {
      if (el.dataset.cat === '__saved') { st.saved = !st.saved; } else { st.saved = false; st.cat = el.dataset.cat; }
      st.page = 1; renderShop(); return;
    }
    if (t.closest('#links a')) $('#links').classList.remove('open');
    if ((el = t.closest('.card'))) { openProduct(el.dataset.id); return; }
    if ((el = t.closest('[data-open]'))) { closeAll(); setTimeout(() => openProduct(el.dataset.open), 50); return; }
    if ((el = t.closest('[data-size]'))) { st.size = el.dataset.size; renderModal(); return; }
    if ((el = t.closest('[data-th]'))) { st.img = Number(el.dataset.th); renderModal(); return; }
    if ((el = t.closest('[data-q]'))) { st.qty = Math.max(1, st.qty + Number(el.dataset.q)); renderModal(); return; }
    if ((el = t.closest('[data-cq]'))) {
      const idx = Number(el.dataset.cq), c = st.cart[idx], p = c && prod(c.pid);
      if (c && p) {
        const d = Number(el.dataset.d), have = st.cart.filter((x) => x.pid === c.pid).reduce((a, x) => a + x.qty, 0);
        if (d > 0 && have >= limitOf(p)) toast(limitOf(p) < p.stock ? 'MAKS. ' + limitOf(p) + ' PER PRODUK' : 'STOK TIDAK CUKUP'); else { c.qty += d; if (c.qty <= 0) st.cart.splice(idx, 1); }
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
      else if (a === 'more') { st.page++; renderShop(); }
      else if (a === 'menu') { const l = $('#links'); l.classList.toggle('open'); el.setAttribute('aria-expanded', l.classList.contains('open')); }
      else if (a === 'an-close') { ssSet('trsh_an_x', S().announcement.text); renderChrome(); }
      else if (a === 'vapply') applyVoucher();
      else if (a === 'vclear') { st.voucher = ''; st.vInput = null; lsSet('trsh_voucher', ''); renderCart(); }
      else if (a === 'usecode') { st.voucher = el.dataset.code; lsSet('trsh_voucher', st.voucher); renderCart(); toast('KODE ' + st.voucher + ' TERSIMPAN — AKTIF DI BAG ✦'); }
      else if (a === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.id === 'scrim' || t.id === 'modal' || t.id === 'popup') closeAll();
    if (!t.closest('#links, #menuBtn')) $('#links').classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeAll(); $('#links').classList.remove('open'); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); openProduct(e.target.dataset.id); return; }
    if (e.key === 'Enter' && e.target.id === 'vIn') { e.preventDefault(); applyVoucher(); }
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'vIn') st.vInput = e.target.value; });
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'nlForm') {
      e.preventDefault();
      const email = String(new FormData(e.target).get('email') || '').trim();
      T.subscribe(email).then(() => toast('WELCOME TO THE NOISE ✦')).catch(() => toast('EMAIL TIDAK VALID / COBA LAGI'));
      e.target.reset();
    }
  });
  $('#q').addEventListener('input', (e) => { st.q = e.target.value.trim(); st.page = 1; renderShop(); });
  $('#sort').addEventListener('change', (e) => { st.sort = e.target.value; st.sortTouched = true; st.page = 1; renderShop(); });

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

  /* scroll: progress bar, back-to-top, nav shadow */
  let sraf = 0;
  function onScroll() {
    sraf = 0;
    const y = window.scrollY, h = document.documentElement.scrollHeight - window.innerHeight;
    $('#progress').style.transform = 'scaleX(' + (h > 0 ? Math.min(1, y / h) : 0) + ')';
    $('#toTop').hidden = !(S().effects.backTop && y > 700);
    $('#nav').classList.toggle('scrolled', y > 8);
  }
  addEventListener('scroll', () => { if (!sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });

  /* ---------------- preloader ---------------- */
  function preload() {
    const pl = $('#preloader');
    if (!S().effects.preloader || PREVIEW) { pl.remove(); document.body.classList.remove('loading'); maybePopup(); return; }
    let n = 0; const num = $('#plNum'), bar = $('#plBar');
    const iv = setInterval(() => {
      n = Math.min(100, n + Math.ceil(Math.random() * 13));
      num.textContent = String(n).padStart(3, '0'); bar.style.width = n + '%';
      if (n >= 100) {
        clearInterval(iv);
        // tunggu data dari Supabase (maks 3,5 dtk) agar tidak sempat tampil data default
        Promise.race([T.ready, new Promise((r) => setTimeout(r, 3500))]).then(() => {
          setTimeout(() => { pl.classList.add('done'); document.body.classList.remove('loading'); setTimeout(() => pl.remove(), 900); maybePopup(); }, 260);
        });
      }
    }, 70);
  }

  /* ---------------- render all + realtime ---------------- */
  function renderAll() {
    applyTheme(); applySeo(); renderChrome(); renderHero(); renderMarquee(); renderDrop();
    renderShop(); renderExtra(); renderAbout(); renderNews(); renderFooter();
    renderCart(); if (st.open) renderModal();
    reveal(); onScroll(); initTracking();
    if ($('#popup').classList.contains('open')) renderPopup(); else if (PREVIEW) maybePopup(); // preview: popup langsung terlihat saat admin mengaktifkannya
    sig = pricingSig();
  }
  let raf = 0;
  T.on(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); });

  renderAll();
  preload();
  setTimeout(() => { st.first = false; }, 1500);
  window.addEventListener('storage', (e) => { if (e.key === 'trsh_cart') { st.cart = ls('trsh_cart', []); renderChrome(); renderCart(); } });
})();
