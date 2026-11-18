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
    light: !!ls('trsh_light', false), recent: ls('trsh_recent', []), ck: null, scrambled: false,
    cust: Object.assign({ name: '', phone: '', address: '', note: '' }, ls('trsh_cust', {})), chan: ls('trsh_chan', ''),
  };
  const cache = new WeakMap();
  const setHTML = (el, html) => { if (!el) return false; if (cache.get(el) === html) return false; cache.set(el, html); el.innerHTML = html; return true; };

  const prod = (id) => D().products.find((p) => p.id === id);
  const catName = (id) => { const c = D().categories.find((x) => x.id === id); return c ? c.name : 'UNCATEGORIZED'; };
  const money = (n) => T.money(n);
  const imgs = (p) => (p.images && p.images.length ? p.images : [T.placeholder(p, 0), T.placeholder(p, 1)]);
  const isPre = (p) => p.stock <= 0 && !!(p.preorder && p.preorder.on);          // pre-order: stok habis tapi tetap bisa dipesan
  const avail = (p) => p.stock > 0 || isPre(p);
  const limitOf = (p) => { const m = Number(S().store.maxPerItem) || 0; const base = isPre(p) ? Math.max(1, Number(p.preorder.limit) || 5) : p.stock; return m > 0 ? Math.min(base, m) : base; };
  const absUrl = (u) => { try { return new URL(u, location.href).href; } catch (e) { return ''; } };
  const httpImg = (p) => { const u = (p.images || [])[0] || ''; return /^data:/i.test(u) ? '' : /^(https?:)?\/\//i.test(u) || /^[\w./-]+\.(png|jpe?g|webp|gif|avif)$/i.test(u) ? absUrl(u) : ''; };
  const prodLink = (p) => location.href.split('#')[0].replace(/([?&])(preview|maint)=1&?/g, '$1').replace(/[?&]$/, '') + '#p-' + p.id;

  let toastT;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2400);
  }
  const popupModal = () => { const el = $('#popup'); return el.classList.contains('open') && el.classList.contains('pos-center'); };
  const lock = () => document.body.classList.toggle('locked', !!(st.open || $('#drawer').classList.contains('open') || popupModal() || $('#sheet').classList.contains('open')));

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
  const hexLum = (hex) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || '')); return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 : 0; };
  // aksen neon yang terlalu terang di latar terang → digelapkan otomatis supaya teks tetap terbaca
  const darkenHex = (hex) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || '')); if (!m || hexLum(hex) < 0.5) return ''; return '#' + [1, 2, 3].map((i) => Math.round(parseInt(m[i], 16) * 0.5).toString(16).padStart(2, '0')).join(''); };
  let prevFlags = [];
  function applyTheme() {
    const s = S(), t0 = s.theme, r = document.documentElement.style, b = document.body.classList;
    const light = !!(s.store.themeToggle && st.light), alt = t0.alt || {};
    const t = light ? Object.assign({}, t0, { bg: alt.bg || t0.bg, fg: alt.fg || t0.fg, muted: alt.muted || t0.muted, card: alt.card || t0.card, line: alt.line || t0.line, accent: alt.accent || darkenHex(t0.accent) || t0.accent }) : t0;
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
    b.toggle('is-light', light);
    const cf = $('#custom-fonts'); if (cf) { const css = T.fontFaceCSS(); if (cf.textContent !== css) cf.textContent = css; }
    r.setProperty('--accent2', t.accent2 || t.accent);
    r.setProperty('--shadow', String(t.shadow == null ? 0.5 : t.shadow));
    [['dens-', ['compact', 'normal', 'airy'], t.density || 'normal'], ['bs-', ['outline', 'solid', 'gradient'], t.btnStyle || 'outline'], ['bgp-', ['grid', 'dots', 'none'], t.bgPattern || 'grid'], ['cur-', ['ring', 'dot', 'cross'], t.cursorStyle || 'ring']]
      .forEach((g) => g[1].forEach((k) => b.toggle(g[0] + k, g[2] === k)));
    b.toggle('no-chrome', t.chromeText === false);
    const plEl = $('#preloader'); if (plEl) plEl.dataset.style = t.loaderStyle || 'counter';
    const g = t.glass || {};
    const lum = (hex) => { const m = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex || '')); return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 : 0; };
    const ink = lum(t.bg) > 0.55 ? '0,0,0' : '255,255,255';
    r.setProperty('--g-blur', (Number(g.blur) || 0) + 'px');
    r.setProperty('--g-sat', String(g.saturate || 1.4));
    r.setProperty('--g-bg', 'color-mix(in srgb, ' + t.card + ' ' + Math.round((Number(g.opacity) || 0) * 100) + '%, transparent)');
    r.setProperty('--g-bg-s', 'color-mix(in srgb, ' + t.bg + ' ' + Math.round(Math.max(0.78, Number(g.opacity) || 0) * 100) + '%, transparent)'); // panel besar: lebih pekat agar teks terbaca
    r.setProperty('--g-border', 'rgba(' + ink + ',' + (Number(g.border) || 0) + ')');
    b.toggle('glass', !!g.on);
    ['nav', 'cards', 'panels', 'ui'].forEach((k) => b.toggle('glass-' + k, !!g.on && g[k] !== false));
    ['lift', 'zoom', 'glow', 'none'].forEach((k) => b.toggle('hv-' + k, (t.cardHover || 'lift') === k));
    ['up', 'fade', 'zoom', 'slide', 'blur'].forEach((k) => b.toggle('rvs-' + k, (t.revealStyle || 'up') === k));
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
    const bl = s.brand, lsrc = T.safeImg(bl.logoImage), lm = lsrc ? (bl.logoMode || 'text') : 'text';
    setHTML($('#logo'), (lm !== 'text' ? `<img class="logo-img" src="${esc(lsrc)}" alt="${esc(bl.name)}" style="height:${Number(bl.logoHeight) || 28}px">` : '') + (lm !== 'image' ? '<span>' + esc(bl.name) + '</span><i>✦</i>' : ''));
    const names = { shop: L('navShop'), drop: L('navDrop'), about: L('navAbout'), newsletter: L('navJoin') };
    const links = T.sectionOrder().filter((k) => names[k] && s.sections[k]).map((k) => [k, names[k]]);
    setHTML($('#links'), links.map((l) => `<a href="#${l[0]}">${esc(l[1])}</a>`).join(''));
    $('#menuBtn').hidden = !links.length;
    const cn = st.cart.reduce((x, c) => x + c.qty, 0);
    $('#cartBtn').innerHTML = esc(L('bag')) + ' <b id="cartN">' + cn + '</b>';
    if (st.lastN != null && cn > st.lastN) { const cb = $('#cartBtn'); cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); }
    st.lastN = cn;
    $('#cartBtn').hidden = !s.store.cart;
    $('#wishBtn').hidden = !s.store.wishlist;
    $('#wishN').textContent = st.wish.length;
    const plt = $('#plText'); if (plt) plt.textContent = s.brand.fullName; // preloader dihapus setelah selesai
    Object.keys(s.sections).forEach((k) => { const el = $('#' + k); if (el) el.hidden = !s.sections[k]; });
    T.sectionOrder().forEach((k, i) => { const el = $('#' + k); if (el) el.style.order = i; });

    renderMaint();
    const tb = $('#themeBtn'); if (tb) { tb.hidden = !s.store.themeToggle; tb.textContent = st.light ? '☾' : '☀'; tb.setAttribute('aria-label', L('theme')); }

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

  /* ---------------- maintenance (6 gaya, bisa dikustom) ---------------- */
  const FORCE_MAINT = new URLSearchParams(location.search).has('maint');
  const QKEY = new URLSearchParams(location.search).get('key');
  function maintOn() {
    const s = S(), m = s.maint || {};
    if (FORCE_MAINT) return true;                       // preview dari admin
    if (PREVIEW) return false;
    if (QKEY && m.bypassKey && QKEY === m.bypassKey) ssSet('trsh_bypass', '1'); // pemilik toko: buka dengan ?key=KODE
    if (ss('trsh_bypass') === '1') return false;
    if (!s.store.maintenance) return false;
    const now = Date.now(), a = m.from ? new Date(m.from).getTime() : NaN, z = m.until ? new Date(m.until).getTime() : NaN;
    if (!isNaN(a) && now < a) return false;             // belum masuk jadwal
    if (m.autoOpen !== false && !isNaN(z) && now >= z) return false; // selesai otomatis saat waktu habis
    return true;
  }
  function renderMaint() {
    const s = S(), m = s.maint || {}, el = $('#maint'), on = maintOn();
    el.hidden = !on;
    document.body.classList.toggle('is-maint', on);
    if (!on) return;
    const STY = ['noise', 'minimal', 'countdown', 'terminal', 'glass', 'split'];
    const style = STY.indexOf(m.style) >= 0 ? m.style : 'noise';
    const title = m.title || s.brand.name, text = m.text || s.store.maintenanceText || '';
    const z = m.until ? new Date(m.until).getTime() : NaN;
    const cd = m.showCountdown !== false && !isNaN(z) && z > Date.now();
    const bg = T.safeImg(m.bgImage), ov = Math.min(1, Math.max(0, Number(m.overlay)));
    const lsrc = T.safeImg(s.brand.logoImage);
    const logo = m.showLogo !== false ? (lsrc ? `<img class="mt-logo" src="${esc(lsrc)}" alt="${esc(s.brand.name)}">` : `<p class="mt-brand mono">${esc(s.brand.name)} ✦</p>`) : '';
    const cdHTML = cd ? `<div class="mcd" data-mend="${z}">${['d', 'h', 'm', 's'].map((u, i) => `<div><b data-mu="${u}">00</b><small>${['HARI', 'JAM', 'MENIT', 'DETIK'][i]}</small></div>`).join('')}</div>` : '';
    const pg = Math.min(100, Math.max(0, Number(m.progress) || 0));
    const prog = pg > 0 ? `<div class="mprog"><span><i style="width:${pg}%"></i></span><small class="mono">${Math.round(pg)}%</small></div>` : '';
    const sub = m.showSubscribe !== false ? `<form class="nl mform" id="mForm"><input type="email" name="email" placeholder="${esc(L('emailPh'))}" aria-label="Email" required><button type="submit">${esc(m.subscribeLabel || 'KABARI SAYA →')}</button></form>` : '';
    const soc = m.showSocial !== false ? socialHTML('maint-soc mono') : '';
    const custom = m.customHtml ? `<div class="mt-custom">${m.customHtml}</div>` : '';
    const subtitle = m.subtitle ? `<p class="mt-sub mono">${esc(m.subtitle)}</p>` : '';
    let inner;
    if (style === 'terminal') {
      const lines = ['> boot ' + s.brand.name.toLowerCase() + '.store', '> status: MAINTENANCE', '> ' + text, m.subtitle ? '> ' + m.subtitle : '', cd ? '> eta: <span data-mend-t="' + z + '"></span>' : ''].filter(Boolean);
      inner = `${logo}<div class="term mono">${lines.map((l, i) => `<p style="--li:${i}">${l.indexOf('<span') >= 0 ? l : esc(l)}</p>`).join('')}<p class="cur" style="--li:${lines.length}">&gt; <i></i></p></div>${prog}${sub}${soc}${custom}`;
    } else if (style === 'countdown') {
      inner = `${logo}${subtitle || '<p class="mt-sub mono">KEMBALI DALAM</p>'}${cdHTML || `<h2 class="chrome">${esc(title)}</h2>`}${cdHTML ? `<h3>${esc(title)}</h3>` : ''}<p class="mt-text">${esc(text)}</p>${prog}${sub}${soc}${custom}`;
    } else if (style === 'noise') {
      inner = `<p class="mono kicker">[ 503 ]</p><h2 class="chrome gl" data-text="${esc(title)}">${esc(title)}</h2><p class="mono mt-text">${esc(text)}</p>${subtitle}${cdHTML}${prog}${sub}${soc}${custom}`;
    } else if (style === 'split') {
      inner = `<div class="mt-l">${logo}<h2 class="chrome">${esc(title)}</h2><p class="mt-text">${esc(text)}</p>${subtitle}${cdHTML}${prog}${sub}${soc}${custom}</div><div class="mt-r">${bg ? `<div class="mt-img" style="background-image:url('${esc(bg).replace(/'/g, '%27')}')"></div>` : `<div class="spark">${SPARK}</div>`}</div>`;
    } else { // minimal & glass
      inner = `${logo}<h2 class="${style === 'minimal' ? '' : 'chrome'}">${esc(title)}</h2><p class="mt-text">${esc(text)}</p>${subtitle}${cdHTML}${prog}${sub}${soc}${custom}`;
    }
    el.className = 'maint mt-' + style;
    setHTML(el, `${style !== 'split' && bg ? `<div class="maint-bg" style="background-image:url('${esc(bg).replace(/'/g, '%27')}')"></div><div class="maint-shade" style="opacity:${isNaN(ov) ? 0.65 : ov}"></div>` : ''}${style === 'glass' ? '<div class="aurora" style="display:block;position:absolute"><i></i><i></i><i></i></div>' : ''}<div class="maint-in">${inner}</div>`);
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
    const bg = T.safeImg(h.bgImage);
    const ov = Math.min(1, Math.max(0, Number(h.bgOverlay)));
    const hero = $('#hero');
    hero.className = 'hero hero-' + (h.size || 'full') + ' ha-' + (h.align === 'center' ? 'center' : 'left') + (bg ? ' has-bg' : '');
    const metaR = h.metaRight || String(new Date().getFullYear());
    setHTML(hero, `
      ${bg ? `<div class="hero-img" style="background-image:url('${esc(bg).replace(/'/g, '%27')}')"></div><div class="hero-shade" style="opacity:${isNaN(ov) ? 0.55 : ov}"></div>` : ''}
      <div class="hero-bg">${h.showArt !== false ? `<div class="spark">${SPARK}</div>` : ''}</div>
      <div class="hero-in">
        <p class="mono eyebrow">${esc(h.eyebrow)}</p>
        <h1 class="hero-t"><span class="gl" data-text="${esc(h.line1)}">${esc(h.line1)}</span><span class="gl chrome" data-text="${esc(h.line2)}">${esc(h.line2)}</span></h1>
        <div class="hero-row"><p class="hero-sub">${esc(h.sub)}</p>${h.cta ? `<a class="btn" href="${esc(cta)}">${esc(h.cta)} <span>↘</span></a>` : ''}</div>
        ${(s.socialCfg || {}).hero ? socialHTML('hero-soc mono') : ''}
      </div>
      ${sticker}
      ${h.showMeta !== false ? `<div class="hero-meta mono"><span>${esc(h.metaLeft)}</span><span>${esc(h.metaCenter || L('scroll'))}</span><span>${esc(metaR)}</span></div>` : ''}`);
    fitHero();
  }
  // judul hero raksasa: kecilkan otomatis bila teks panjang agar tidak terpotong di tepi layar
  function fitHero() {
    const t = $('.hero-t'), box = $('.hero-in');
    if (!t || !box) return;
    t.style.fontSize = '';
    const base = parseFloat(getComputedStyle(t).fontSize) || 100, avail = box.clientWidth;
    const w = Math.max.apply(null, $$('.hero-t .gl').map((g) => g.scrollWidth));
    if (avail > 0 && w > avail) t.style.fontSize = Math.floor(base * (avail / w) * 0.97) + 'px';
  }
  addEventListener('resize', () => fitHero());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitHero());

  function renderMarquee() {
    const m = S().marquee;
    const unit = `<span>${esc(m.text)} ✦</span>`.repeat(6);
    $('#marquee').style.setProperty('--mq', (Number(m.speed) || 28) + 's');
    setHTML($('#marquee'), `<div class="mq"><div style="display:flex">${unit}</div><div style="display:flex">${unit}</div></div>`);
  }

  function renderDrop() {
    const d = S().drop;
    setHTML($('#drop'), `
      <div><p class="mono kicker">${esc(d.kicker || '[ 01 — ' + d.title + ' ]')}</p><h2 class="chrome">${esc(d.title)}</h2><p class="note">${esc(d.note)}</p></div>
      <div class="cd" id="cd"><div><b data-u="d">00</b><small>${esc(L('days'))}</small></div><div><b data-u="h">00</b><small>${esc(L('hrs'))}</small></div><div><b data-u="m">00</b><small>${esc(L('min'))}</small></div><div><b data-u="s">00</b><small>${esc(L('sec'))}</small></div></div>`);
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
  const pricingSig = () => D().products.map((p) => { const x = T.pricing(p); return x.price + (x.on ? '*' : ''); }).join(',') + '|' + (T.promoState().on ? 1 : 0) + '|' + (maintOn() ? 1 : 0);
  setInterval(() => {
    tick();
    $$('[data-end]').forEach((el) => { el.textContent = left(Number(el.dataset.end) - Date.now()); });
    $$('[data-mend]').forEach((el) => {
      const ms = Math.max(0, Number(el.dataset.mend) - Date.now());
      const v = { d: Math.floor(ms / 864e5), h: Math.floor(ms / 36e5) % 24, m: Math.floor(ms / 6e4) % 60, s: Math.floor(ms / 1e3) % 60 };
      $$('[data-mu]', el).forEach((b) => { b.textContent = pad(v[b.dataset.mu]); });
    });
    $$('[data-mend-t]').forEach((el) => { el.textContent = left(Number(el.dataset.mendT) - Date.now()); });
    const n = pricingSig();
    if (sig && n !== sig) { sig = n; renderAll(); } else sig = n;
  }, 1000);

  /* ---------------- SHOP ---------------- */
  function listProducts() {
    let list = D().products.filter((p) => p.active !== false);
    const hidden = D().categories.filter((c) => !c.visible).map((c) => c.id);
    list = list.filter((p) => hidden.indexOf(p.category) < 0);
    if (S().store.soldOut === 'hide') list = list.filter((p) => avail(p));
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
    if (s.store.soldOut === 'last') list = list.filter((p) => avail(p)).concat(list.filter((p) => !avail(p)));

    const per = Number(s.store.perPage) || 0;
    const shown = per > 0 ? list.slice(0, per * st.page) : list;
    $('#empty').textContent = L('noResult');
    $('#empty').hidden = list.length > 0;
    setHTML($('#more'), per > 0 && shown.length < list.length ? `<button class="btn" data-act="more">${esc(L('loadMore'))} <span>↓</span></button><p class="mono">${shown.length} / ${list.length}</p>` : '');
    if (setHTML($('#grid'), shown.map(card).join(''))) reveal();
  }
  function card(p, i) {
    const s = S().store, im = imgs(p), out = !avail(p), x = T.pricing(p), pre = isPre(p);
    const low = !out && !pre && s.showStock && p.stock <= s.lowStock;
    const badges = [];
    if (out) badges.push(`<span class="badge out">${esc(L('soldOut'))}</span>`);
    else if (pre) badges.push(`<span class="badge pre">${esc(L('preorder'))}</span>`);
    else {
      const sb = saleBadge(x); if (sb) badges.push(sb);
      if (p.badge && p.badge !== 'SOLD OUT') badges.push(`<span class="badge hot">${esc(p.badge)}</span>`);
    }
    if (low && !(p.badge || '').match(/LOW/i)) badges.push(`<span class="badge">${esc(L('onlyLeft', { n: p.stock }))}</span>`);
    return `<article class="card rv ${out ? 'soldout' : ''}" data-id="${esc(p.id)}" style="--i:${i % 8}" tabindex="0" role="button" aria-label="${esc(p.name)}">
      <div class="card-media"><div class="badges">${badges.join('')}</div>
        <button class="wish ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save" tabindex="-1">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>
        <img class="m1" src="${esc(im[0])}" alt="${esc(p.name)}" loading="lazy" decoding="async" onload="this.classList.add('ld')" onerror="this.classList.add('ld')">${im[1] ? `<img class="m2" src="${esc(im[1])}" alt="" loading="lazy" decoding="async">` : ''}</div>
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
    setHTML($('#newsletter'), `<div class="rv"><p class="mono kicker">${esc(f.newsletterKicker || '[ 04 — NEWSLETTER ]')}</p><h2>${esc(f.newsletterTitle)}</h2><p>${esc(f.newsletterText)}</p>
      <form class="nl" id="nlForm"><input type="email" name="email" placeholder="${esc(L('emailPh'))}" aria-label="Email" required><button type="submit">${esc(L('subscribe'))}</button></form></div>`);
    reveal();
  }
  function renderFooter() {
    const s = S(), f = s.footer;
    const fl = (s.socialCfg || {}).footer !== false;
    const wm = f.wordmark || s.brand.fullName;
    setHTML($('#footer'), `<div class="foot-top mono">${fl ? socialHTML('foot-soc') : '<span></span>'}<span>${esc(s.brand.tagline)}</span></div>
      ${f.showWordmark !== false ? `<div class="wordmark chrome"><span id="wmText">${esc(wm)}</span></div>` : ''}
      <div class="foot-b mono"><span>${esc(f.text)}</span>${f.showBackTop !== false ? `<a href="#top">${esc(L('backTop'))}</a>` : ''}</div>`);
    fitWordmark();
  }
  // tulisan raksasa di footer: kecilkan otomatis agar selalu muat (tidak terpotong)
  function fitWordmark() {
    const box = $('.wordmark'), tx = $('#wmText');
    if (!box || !tx) return;
    box.style.fontSize = '';
    const base = parseFloat(getComputedStyle(box).fontSize) || 100;
    const avail = box.clientWidth, w = tx.getBoundingClientRect().width;
    if (avail > 0 && w > avail) box.style.fontSize = Math.floor(base * (avail / w) * 0.98) + 'px';
  }
  addEventListener('resize', () => fitWordmark());
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => fitWordmark());

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
    st.recent = [id].concat(st.recent.filter((x) => x !== id)).slice(0, 10); lsSet('trsh_recent', st.recent); renderRecent();
    renderModal();
    if (S().store.deepLinks && !PREVIEW && location.hash !== '#p-' + id) { try { history.replaceState(null, '', '#p-' + id); } catch (e) {} }
    $('#modal').classList.add('open'); $('#modal').setAttribute('aria-hidden', 'false');
    $('#scrim').classList.add('on'); lock();
    const mdEl = $('#modal .md'); if (mdEl) mdEl.scrollTop = 0;
    setTimeout(() => { const m = $('#modal .md'); if (m) m.focus({ preventScroll: true }); }, 60);
  }
  function renderModal() {
    const p = prod(st.open);
    if (!p) { if (st.open) closeAll(); return; }
    const s = S().store, im = imgs(p), out = !avail(p), x = T.pricing(p), pre = isPre(p);
    const low = !out && !pre && s.showStock && p.stock <= s.lowStock;
    const stock = pre ? `<span class="stock low">● ${esc(L('preorder'))}${p.preorder.eta ? ' · ' + esc(L('eta')) + ' ' + esc(p.preorder.eta) : ''}</span>` : out ? `<span class="stock out">● ${esc(L('soldOut'))}</span>` : low ? `<span class="stock low">● ${esc(L('onlyLeft', { n: p.stock }))}</span>` : s.showStock ? `<span class="stock">● ${esc(L('inStock'))}</span>` : '';
    const sizes = (p.sizes || []).map((z) => `<button class="${st.size === z ? 'on' : ''}" data-size="${esc(z)}">${esc(z)}</button>`).join('');
    const lim = limitOf(p);
    st.qty = Math.min(Math.max(1, st.qty), Math.max(1, lim));
    const closed = s.ordering === false;
    setHTML($('#modal'), `<div class="md" role="dialog" aria-modal="true" aria-label="${esc(p.name)}" tabindex="-1">
      <button class="x md-x" data-act="close" aria-label="Close">✕</button>
      <div class="md-g"><div class="md-main ${s.lightbox ? 'zoomable' : ''}" ${s.lightbox ? 'data-act="zoom" title="' + esc(L('zoom')) + '"' : ''}><div class="badges">${out ? '' : saleBadge(x)}</div><img src="${esc(im[st.img] || im[0])}" alt="${esc(p.name)}"></div>
        ${im.length > 1 ? `<div class="md-th">${im.map((u, i) => `<img src="${esc(u)}" data-th="${i}" class="${i === st.img ? 'on' : ''}" alt="">`).join('')}</div>` : ''}</div>
      <div class="md-i">
        <p class="mono kicker" style="margin:0">${esc(catName(p.category))}${p.sku ? ` · <span class="dim">SKU ${esc(p.sku)}</span>` : ''}</p>
        <h2>${esc(p.name)}</h2>
        <div class="md-price"><div class="pb">${priceHTML(p, true)}${x.on && s.showSavings ? `<span class="save mono">${esc(L('youSave'))} ${money(x.save)} (−${x.pct}%)</span>` : ''}</div>${stock}</div>
        ${x.on && x.end ? `<p class="sale-end mono">⏱ <span data-end="${x.end}">${left(x.end - Date.now())}</span></p>` : ''}
        <p class="desc">${esc(p.desc)}</p>
        ${sizes ? `<div><div class="lab mono"><span>${esc(L('size'))}</span>${sizeGuideOf(p) ? `<button class="lnk mono" data-act="sizeguide">${esc(L('sizeGuide'))}</button>` : ''}</div><div class="sz">${sizes}</div></div>` : ''}
        ${s.cart ? `<div><div class="lab mono"><span>${esc(L('qty'))}</span>${Number(s.maxPerItem) > 0 ? `<span>MAKS ${lim}</span>` : ''}</div><div class="qty"><button data-q="-1" aria-label="−">−</button><span>${st.qty}</span><button data-q="1" aria-label="+">+</button></div></div>` : ''}
        ${closed ? `<p class="mono closed-note">${esc(s.closedText)}</p>` : ''}
        <div class="md-act">${s.cart ? `<button class="btn solid full" data-act="add" ${out ? 'disabled' : ''}>${out ? esc(L('soldOut')) : pre ? esc(L('preorder')) : esc(L('addToBag'))} <span>+</span></button>` : ''}
          ${s.wishlist ? `<button class="wishb ${st.wish.indexOf(p.id) >= 0 ? 'on' : ''}" data-wish="${esc(p.id)}" aria-label="Save">${st.wish.indexOf(p.id) >= 0 ? '♥' : '♡'}</button>` : ''}
          ${s.share ? `<button class="wishb" data-act="share" aria-label="${esc(L('share'))}" title="${esc(L('share'))}">⇪</button>` : ''}</div>
        ${relatedHTML(p)}
      </div></div>`);
  }

  const sizeGuideOf = (p) => { const c = D().categories.find((x) => x.id === p.category); return c && String(c.sizeGuide || '').trim() ? String(c.sizeGuide).trim() : ''; };
  function relatedHTML(p) {
    if (!S().store.related) return '';
    const list = D().products.filter((q) => q.id !== p.id && q.active !== false && q.category === p.category && avail(q)).slice(0, 4);
    if (!list.length) return '';
    return `<div class="rel"><p class="mono lab">${esc(L('related'))}</p><div class="mini-g">${list.map((q) => miniCard(q, 'data-rel')).join('')}</div></div>`;
  }
  function miniCard(p, attr) {
    const x = T.pricing(p);
    return `<button class="mini" ${attr || 'data-open'}="${esc(p.id)}"><img src="${esc(imgs(p)[0])}" alt="" loading="lazy"><span>${esc(p.name)}</span><b>${money(x.price)}</b></button>`;
  }
  function renderRecent() {
    const el = $('#recent'); if (!el) return;
    const ids = st.recent.filter((id) => { const p = prod(id); return p && p.active !== false; }).slice(0, 6);
    setHTML(el, S().store.recent && ids.length ? `<p class="mono kicker">${esc(L('recent'))}</p><div class="mini-g">${ids.map((id) => miniCard(prod(id))).join('')}</div>` : '');
  }
  function sizeGuideSheet(p) {
    const rows = sizeGuideOf(p).split('\n').map((l) => l.split('|').map((c) => c.trim())).filter((r) => r.some(Boolean));
    if (!rows.length) return;
    openSheet(`<div class="sh-card" role="dialog" aria-modal="true"><button class="x" data-act="sheet-close" aria-label="Close">✕</button><p class="mono kicker">${esc(catName(p.category))}</p><h3>${esc(L('sizeGuide'))}</h3>
      <div class="sg-wrap"><table class="sg"><thead><tr>${rows[0].map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.slice(1).map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></div>`);
  }
  function openLB(i) {
    const p = prod(st.open); if (!p) return;
    const im = imgs(p); st.lb = ((i % im.length) + im.length) % im.length;
    const el = $('#lb');
    setHTML(el, `<button class="x lb-x" data-act="lb-close" aria-label="Close">✕</button>${im.length > 1 ? '<button class="lb-n prev" data-act="lb-prev" aria-label="Prev">‹</button><button class="lb-n next" data-act="lb-next" aria-label="Next">›</button>' : ''}<img src="${esc(im[st.lb])}" alt="${esc(p.name)}">`);
    el.classList.add('open'); el.setAttribute('aria-hidden', 'false');
  }
  const closeLB = () => { const el = $('#lb'); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true'); };
  function shareProduct(p) {
    const url = prodLink(p), data = { title: p.name, text: p.name + ' — ' + money(T.pricing(p).price), url };
    if (navigator.share) { navigator.share(data).catch(() => {}); return; }
    copyText(url).then((ok) => toast(ok ? L('copied') : url));
  }
  function fromHash() {
    const m = /^#p-(.+)$/.exec(location.hash); if (!m || !S().store.deepLinks) return;
    const p = prod(decodeURIComponent(m[1])); if (p && p.active !== false && st.open !== p.id) openProduct(p.id);
  }
  addEventListener('hashchange', fromHash);

  /* ---------------- animasi: fly-to-cart, heart burst, ripple, magnetic, scramble ---------------- */
  const reduced = () => matchMedia('(prefers-reduced-motion:reduce)').matches;
  function fly(src) {
    if (!S().effects.flyToCart || reduced() || !src || !src.getBoundingClientRect) return;
    const a = src.getBoundingClientRect(), tb = $('#cartBtn').getBoundingClientRect();
    if (!a.width || tb.width === 0) return;
    const el = document.createElement('img'); el.className = 'fly'; el.src = src.currentSrc || src.src;
    el.style.cssText = 'left:' + a.left + 'px;top:' + a.top + 'px;width:' + a.width + 'px;height:' + a.height + 'px';
    document.body.appendChild(el);
    const dx = tb.left + tb.width / 2 - (a.left + a.width / 2), dy = tb.top + tb.height / 2 - (a.top + a.height / 2);
    const an = el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1, borderRadius: '2px' }, { transform: `translate(${dx * 0.55}px,${dy * 0.35 - 60}px) scale(.5)`, opacity: 0.95, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) scale(.04)`, opacity: 0.1, borderRadius: '50%' }], { duration: 760, easing: 'cubic-bezier(.5,0,.2,1)' });
    an.onfinish = () => { el.remove(); const cb = $('#cartBtn'); cb.classList.remove('bump'); void cb.offsetWidth; cb.classList.add('bump'); };
  }
  function burst(el) {
    if (!S().effects.heartBurst || reduced() || !el) return;
    const r = el.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const h = document.createElement('i'); h.className = 'hb'; h.textContent = '♥';
      const ang = (Math.PI * 2 * i) / 7 + Math.random() * 0.6, d = 34 + Math.random() * 26;
      h.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d - 14}px`;
      document.body.appendChild(h); setTimeout(() => h.remove(), 800);
    }
  }
  function ripple(e, el) {
    if (!S().effects.ripple || reduced()) return;
    const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, sp = document.createElement('span');
    sp.className = 'rpl'; sp.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    el.appendChild(sp); setTimeout(() => sp.remove(), 650);
  }
  function scramble(el, text) {
    const glyphs = '█▓▒░#%&/\\<>+=*01', n = text.length, t0 = performance.now(), dur = 900;
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur), fixed = Math.floor(k * n);
      el.textContent = text.split('').map((ch, i) => (ch === ' ' || i < fixed ? ch : glyphs[Math.floor(Math.random() * glyphs.length)])).join('');
      if (k < 1) requestAnimationFrame(f); else el.textContent = text;
    })(t0);
  }
  function heroScramble() {
    if (st.scrambled || !S().effects.scramble || reduced()) return;
    st.scrambled = true;
    $$('.hero-t .gl').forEach((el, i) => { const tx = el.textContent; setTimeout(() => scramble(el, tx), 250 + i * 200); });
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
      if (!p || p.active === false || !avail(p)) { changed = true; return; }
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
    if (!p || !avail(p)) { toast(L('soldOut')); return false; }
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
        ${custForm()}${channelButtons(closed || belowMin)}</div>` : ''}`);
  }
  /* ---------------- checkout: banyak channel + struk gambar ---------------- */
  function custForm() {
    const ck = S().store.checkout || {}, cu = st.cust;
    const f = (k, on, req, lab, type) => !on ? '' : `<label class="cf"><span class="mono">${esc(L(lab))}${req ? ' *' : ''}</span>${type === 'area' ? `<textarea data-cust="${k}" rows="2" autocomplete="street-address">${esc(cu[k])}</textarea>` : `<input data-cust="${k}" type="${type}" value="${esc(cu[k])}" autocomplete="${k === 'name' ? 'name' : 'tel'}">`}</label>`;
    const html = f('name', ck.askName, ck.requireName, 'name', 'text') + f('phone', ck.askPhone, ck.requirePhone, 'phone', 'tel') + f('address', ck.askAddress, ck.requireAddress, 'address', 'area') + f('note', ck.askNote, false, 'note', 'area');
    return html ? `<div class="cform">${html}</div>` : '';
  }
  function channelButtons(disabled) {
    const chans = T.channelList(), dis = disabled ? 'disabled' : '';
    if (!chans.length) return `<p class="mono closed-note">BELUM ADA CHANNEL CHECKOUT YANG AKTIF</p>`;
    if (chans.length === 1) return `<button class="btn solid full" data-act="checkout" data-ch="${chans[0].k}" ${dis}>${esc(L('checkoutVia', { ch: chans[0].n.toUpperCase() }))} <span>→</span></button>`;
    return `<p class="mono lab">${esc(L('chooseChannel'))}</p><div class="chs">${chans.map((c) => `<button class="btn ch" data-act="checkout" data-ch="${c.k}" ${dis}><i>${c.i}</i> ${esc(c.n)}</button>`).join('')}</div>`;
  }
  function copyText(t) {
    const fb = () => { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;left:-999px'; document.body.appendChild(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok; };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(() => true, () => fb());
    return Promise.resolve(fb());
  }
  function buildMessage(c, id, name) {
    const sh = S().store, ck = sh.checkout || {}, cu = st.cust, mode = ck.image || 'off', links = mode === 'links' || mode === 'both';
    const txt = c.lines.map((l) => {
      let t = `- ${l.p.name}${l.c.size ? ' [' + l.c.size + ']' : ''} x${l.c.qty} = ${money(l.line)}${l.x.on ? ` (diskon ${l.x.pct}%)` : ''}${isPre(l.p) ? ' [PRE-ORDER' + (l.p.preorder.eta ? ', est. ' + l.p.preorder.eta : '') + ']' : ''}`;
      if (links) { const u = httpImg(l.p) || (sh.deepLinks ? prodLink(l.p) : ''); if (u) t += '\n  ' + u; }
      return t;
    }).join('\n');
    const sum = [];
    if (c.itemSave > 0 || c.v.disc > 0 || c.fee > 0) sum.push('Subtotal: ' + money(c.orig));
    if (c.itemSave > 0) sum.push('Diskon produk: -' + money(c.itemSave));
    if (c.v.disc > 0) sum.push('Voucher ' + c.v.code + ': -' + money(c.v.disc));
    if (c.fee > 0) sum.push('Ongkir: ' + (c.shipping ? money(c.shipping) : 'GRATIS'));
    const sumText = sum.join('\n');
    const cl = [];
    if (ck.askName && cu.name.trim()) cl.push('Nama: ' + cu.name.trim());
    if (ck.askPhone && cu.phone.trim()) cl.push('No. HP: ' + cu.phone.trim());
    if (ck.askAddress && cu.address.trim()) cl.push('Alamat: ' + cu.address.trim());
    if (ck.askNote && cu.note.trim()) cl.push('Catatan: ' + cu.note.trim());
    const asked = ck.askName || ck.askPhone || ck.askAddress || ck.askNote;
    const customer = asked ? cl.join('\n') : 'Nama:\nAlamat:\nCatatan:';
    let tpl = String(sh.template || '{items}\n{summary}\nTotal: {total}\n\n{customer}');
    if (tpl.indexOf('{summary}') < 0 && sumText) tpl = tpl.split('{items}').join('{items}\n' + sumText);
    if (tpl.indexOf('{customer}') < 0 && cl.length) tpl += '\n\n{customer}';
    if (!sumText) tpl = tpl.split('{summary}\n').join('').split('{summary}').join('');
    if (!customer) tpl = tpl.split('\n\n{customer}').join('').split('{customer}').join('');
    const fill = (t) => t.split('{items}').join(txt).split('{summary}').join(sumText).split('{customer}').join(customer)
      .split('{subtotal}').join(money(c.sub)).split('{discount}').join(money(c.itemSave + c.v.disc))
      .split('{shipping}').join(c.shipping ? money(c.shipping) : L('free')).split('{voucher}').join(c.v.ok ? c.v.code : '-')
      .split('{orderId}').join(id).split('{total}').join(money(c.total)).split('{brand}').join(S().brand.fullName)
      .split('{name}').join(cu.name.trim()).split('{phone}').join(cu.phone.trim()).split('{address}').join(cu.address.trim()).split('{note}').join(cu.note.trim()).split('{channel}').join(name);
    return { msg: fill(tpl), subject: fill(String(ck.emailSubject || 'Pesanan {orderId} — {brand}')) };
  }
  function openChannel(k, msg, subject) {
    const d = T.CHANNELS.find((x) => x.k === k) || {}, url = T.channelUrl(k, msg, subject);
    if (!url) return;
    if (d.copy) copyText(msg).then((ok) => toast(ok ? 'PESAN DISALIN — TEMPEL DI CHAT' : 'SALIN PESAN SECARA MANUAL'));
    if (k === 'email' || k === 'sms') { location.href = url; return; }
    const w = window.open(url, '_blank');
    if (w) { try { w.opener = null; } catch (e) {} } else location.href = url; // popup diblokir (mis. browser mobile)
  }

  // gambar struk (canvas): thumbnail produk, harga, diskon, total, data pembeli
  function loadImg(u) {
    return new Promise((res) => {
      const im = new Image();
      if (/^https?:/i.test(u) || /^\/\//.test(u)) im.crossOrigin = 'anonymous';
      const done = (v) => { clearTimeout(t); res(v); }, t = setTimeout(() => res(null), 6000);
      im.onload = () => done(im); im.onerror = () => done(null); im.src = u;
    });
  }
  function wrapLines(ctx, text, maxW, maxLines) {
    const words = String(text).split(/\s+/), out = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { out.push(cur); cur = w; } else cur = t; });
    if (cur) out.push(cur);
    if (out.length > maxLines) { out.length = maxLines; out[maxLines - 1] = out[maxLines - 1].replace(/.{0,2}$/, '…'); }
    return out;
  }
  async function makeReceipt(o) {
    const s = S(), c = o.c, W = 900, P = 48, RH = 132, ck = s.store.checkout || {}, cu = st.cust;
    const sans = "Inter,'Segoe UI',system-ui,-apple-system,Roboto,sans-serif", mono = "ui-monospace,Menlo,Consolas,'Courier New',monospace";
    const disp = (getComputedStyle(document.documentElement).getPropertyValue('--f-display') || '').trim() || sans;
    const accent = s.theme.accent || '#c6ff2e', onAcc = T.contrast(accent);
    const imgsLoaded = await Promise.all(c.lines.map((l) => loadImg(imgs(l.p)[0])));
    const sums = [];
    if (c.itemSave > 0 || c.v.disc > 0 || c.fee > 0) sums.push([L('subtotal'), money(c.orig)]);
    if (c.itemSave > 0) sums.push(['DISKON PRODUK', '−' + money(c.itemSave)]);
    if (c.v.disc > 0) sums.push(['VOUCHER ' + c.v.code, '−' + money(c.v.disc)]);
    if (c.fee > 0) sums.push([L('shipping'), c.shipping ? money(c.shipping) : L('free')]);
    const cl = [];
    if (ck.askName && cu.name.trim()) cl.push([L('name'), cu.name.trim()]);
    if (ck.askPhone && cu.phone.trim()) cl.push([L('phone'), cu.phone.trim()]);
    if (ck.askAddress && cu.address.trim()) cl.push([L('address'), cu.address.trim()]);
    if (ck.askNote && cu.note.trim()) cl.push([L('note'), cu.note.trim()]);
    const cv = document.createElement('canvas'), measure = cv.getContext('2d');
    measure.font = '500 22px ' + sans;
    const clLines = cl.map((r) => wrapLines(measure, r[1], W - P * 2 - 190, 3));
    const clH = cl.length ? 60 + clLines.reduce((a, x) => a + Math.max(1, x.length) * 32 + 8, 0) : 0;
    const H = 190 + c.lines.length * RH + 30 + sums.length * 40 + 100 + clH + 120;
    cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = accent; g.fillRect(0, 0, W, 16);
    g.fillStyle = '#0c0c0e'; g.textBaseline = 'alphabetic';
    g.font = '800 50px ' + disp; g.fillText(String(s.brand.fullName).toUpperCase().slice(0, 22), P, 92);
    g.fillStyle = '#6b6b70'; g.font = '500 20px ' + mono; g.fillText('STRUK PESANAN', P, 130);
    g.textAlign = 'right'; g.fillStyle = '#0c0c0e'; g.font = '700 24px ' + mono; g.fillText(o.id, W - P, 92);
    g.fillStyle = '#6b6b70'; g.font = '500 20px ' + mono; g.fillText(new Date(o.time).toLocaleString('id-ID'), W - P, 130); g.textAlign = 'left';
    g.fillStyle = '#e2dfd8'; g.fillRect(P, 156, W - P * 2, 2);
    let y = 190;
    c.lines.forEach((l, i) => {
      const tx = P + 112, rx = W - P, im = imgsLoaded[i];
      g.save(); g.beginPath(); g.rect(P, y, 96, 112); g.clip();
      if (im) { const r = Math.max(96 / im.width, 112 / im.height), sw = 96 / r, sh2 = 112 / r; g.drawImage(im, (im.width - sw) / 2, (im.height - sh2) / 2, sw, sh2, P, y, 96, 112); }
      else { g.fillStyle = '#ece9e2'; g.fillRect(P, y, 96, 112); g.fillStyle = '#9a978f'; g.font = '800 44px ' + sans; g.textAlign = 'center'; g.fillText(l.p.name.charAt(0).toUpperCase(), P + 48, y + 70); g.textAlign = 'left'; }
      g.restore(); g.strokeStyle = '#e2dfd8'; g.lineWidth = 2; g.strokeRect(P, y, 96, 112);
      g.fillStyle = '#0c0c0e'; g.font = '700 25px ' + sans;
      const nl = wrapLines(g, l.p.name, rx - tx - 220, 2); nl.forEach((t, k) => g.fillText(t, tx, y + 30 + k * 30));
      g.fillStyle = '#6b6b70'; g.font = '500 20px ' + mono;
      g.fillText((l.c.size ? 'UKURAN ' + l.c.size + '  ·  ' : '') + 'QTY ' + l.c.qty + (isPre(l.p) ? '  ·  PRE-ORDER' : ''), tx, y + 30 + nl.length * 30 + 6);
      g.textAlign = 'right'; g.fillStyle = '#0c0c0e'; g.font = '700 26px ' + sans; g.fillText(money(l.line), rx, y + 32);
      if (l.x.on) { const old = money(l.x.orig * l.c.qty); g.fillStyle = '#8a877f'; g.font = '500 20px ' + sans; g.fillText(old, rx, y + 64); const w2 = g.measureText(old).width; g.fillRect(rx - w2, y + 58, w2, 2); g.fillStyle = '#ff2a3d'; g.font = '700 18px ' + mono; g.fillText('−' + l.x.pct + '%', rx, y + 92); }
      g.textAlign = 'left'; y += RH;
      g.fillStyle = '#efece6'; g.fillRect(P, y - 12, W - P * 2, 1);
    });
    y += 18;
    sums.forEach((r) => { g.fillStyle = '#6b6b70'; g.font = '500 22px ' + mono; g.fillText(r[0], P, y); g.textAlign = 'right'; g.fillStyle = '#0c0c0e'; g.fillText(r[1], W - P, y); g.textAlign = 'left'; y += 40; });
    y += 12; g.fillStyle = accent; g.fillRect(P, y - 4, W - P * 2, 78);
    g.fillStyle = onAcc; g.font = '700 24px ' + mono; g.fillText(String(L('total')).toUpperCase(), P + 22, y + 46);
    g.textAlign = 'right'; g.font = '800 38px ' + sans; g.fillText(money(c.total), W - P - 22, y + 50); g.textAlign = 'left'; y += 112;
    if (cl.length) {
      g.fillStyle = '#e2dfd8'; g.fillRect(P, y - 22, W - P * 2, 2);
      cl.forEach((r, i) => { g.fillStyle = '#6b6b70'; g.font = '500 20px ' + mono; g.fillText(String(r[0]).toUpperCase(), P, y + 10); g.fillStyle = '#0c0c0e'; g.font = '500 22px ' + sans; (clLines[i].length ? clLines[i] : ['']).forEach((t, k) => g.fillText(t, P + 190, y + 10 + k * 32)); y += Math.max(1, clLines[i].length) * 32 + 8; });
      y += 14;
    }
    g.fillStyle = '#6b6b70'; g.font = '500 20px ' + mono; g.textAlign = 'center';
    g.fillText(ck.receiptNote || '', W / 2, H - 62);
    g.fillStyle = '#a6a39b'; g.font = '500 17px ' + mono; g.fillText(location.protocol.indexOf('http') === 0 ? location.host : String(s.brand.fullName), W / 2, H - 30);
    return new Promise((res) => cv.toBlob((b) => res(b), 'image/jpeg', 0.92)); // JPEG: encode jauh lebih cepat & file kecil untuk dibagikan
  }

  function confetti() {
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const cv = document.createElement('canvas'); cv.className = 'confetti'; cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
    const g = cv.getContext('2d'), cs = [S().theme.accent, S().theme.accent2 || '#7a5cff', '#ff2a3d', '#ffffff', '#00c8ff'];
    const ps = Array.from({ length: 150 }, () => ({ x: innerWidth / 2 + (Math.random() - 0.5) * 200, y: innerHeight * 0.62, vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 17 - 6, w: 6 + Math.random() * 7, h: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: cs[Math.floor(Math.random() * cs.length)] }));
    const t0 = performance.now();
    (function f(t) {
      const k = t - t0; g.clearRect(0, 0, cv.width, cv.height);
      ps.forEach((p) => { p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.vx *= 0.99; p.r += p.vr; g.save(); g.globalAlpha = Math.max(0, 1 - k / 2600); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); g.restore(); });
      if (k < 2600) requestAnimationFrame(f); else cv.remove();
    })(t0);
  }

  const canShareFile = (blob) => { try { return !!(blob && navigator.canShare && navigator.canShare({ files: [new File([blob], 'struk.jpg', { type: blob.type || 'image/jpeg' })] })); } catch (e) { return false; } };
  function openSheet(html, cls) {
    const el = $('#sheet'); el.className = 'sheet open ' + (cls || ''); el.setAttribute('aria-hidden', 'false'); setHTML(el, html); lock();
  }
  function closeSheet() {
    const el = $('#sheet'); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
    if (st.ck && st.ck.url) { try { URL.revokeObjectURL(st.ck.url); } catch (e) {} }
    st.ck = null; lock();
  }
  function ckSheet() {
    const k = st.ck, ck = S().store.checkout || {}, d = T.CHANNELS.find((x) => x.k === k.ch) || {};
    openSheet(`<div class="sh-card ck" role="dialog" aria-modal="true"><button class="x" data-act="sheet-close" aria-label="Close">✕</button>
      <p class="mono kicker">${esc(k.id)}</p><h3>${esc(ck.successTitle)}</h3><p class="ck-t">${esc(ck.successText)}</p>
      ${k.url ? `<img class="ck-img" src="${k.url}" alt="Struk pesanan">` : k.pending ? '<p class="ck-wait mono">MEMBUAT GAMBAR STRUK…</p>' : ''}
      <div class="ck-act"><button class="btn solid" data-act="ck-open">${esc(L('checkoutVia', { ch: String(d.n || '').toUpperCase() }))} <span>→</span></button>
        ${canShareFile(k.blob) ? '<button class="btn" data-act="ck-share">BAGIKAN GAMBAR + PESAN</button>' : ''}
        ${k.url ? `<a class="btn" href="${k.url}" download="struk-${esc(k.id)}.jpg">UNDUH STRUK</a>` : ''}
        <button class="btn" data-act="ck-copy">SALIN PESAN</button></div>
      <details class="ck-msg"><summary class="mono">LIHAT ISI PESAN</summary><pre>${esc(k.msg)}</pre></details></div>`, 'ck-sheet');
  }
  async function checkout(ch) {
    const sh = S().store, ck = sh.checkout || {};
    if (sh.ordering === false) { toast(sh.closedText); return; }
    const c = calc(); if (!c.lines.length) return;
    if (Number(sh.minOrder) > 0 && c.after < Number(sh.minOrder)) { toast('MIN. ORDER ' + money(sh.minOrder)); return; }
    const chans = T.channelList(), chan = chans.find((x) => x.k === ch) || chans[0];
    if (!chan) { toast('CHANNEL CHECKOUT BELUM DIATUR'); return; }
    const cu = st.cust, need = (on, req, k, msg) => { if (on && req && !String(cu[k]).trim()) { toast(L(msg)); const f = $('[data-cust=' + k + ']'); if (f) f.focus(); return true; } return false; };
    if (need(ck.askName, ck.requireName, 'name', 'fillName') || need(ck.askPhone, ck.requirePhone, 'phone', 'fillPhone') || need(ck.askAddress, ck.requireAddress, 'address', 'fillAddress')) return;
    st.chan = chan.k; lsSet('trsh_chan', chan.k);
    const id = T.uid('ord-').toUpperCase(), time = Date.now();
    const { msg, subject } = buildMessage(c, id, chan.n);
    T.orders.add({
      id, time, status: 'new', total: c.total,
      items: c.lines.map((l) => ({ id: l.p.id, name: l.p.name, size: l.c.size, qty: l.c.qty, price: l.x.price, orig: l.x.orig, pre: isPre(l.p) ? 1 : 0, img: httpImg(l.p) })),
      meta: {
        subtotal: c.orig, itemDiscount: c.itemSave, voucher: c.v.ok ? c.v.code : '', voucherDiscount: c.v.disc, shipping: c.shipping, channel: chan.k,
        customer: { name: cu.name.trim().slice(0, 80), phone: cu.phone.trim().slice(0, 30), address: cu.address.trim().slice(0, 300), note: cu.note.trim().slice(0, 300) },
      },
    });
    track('checkout', { currency: 'IDR', value: c.total });
    const wantReceipt = ck.image === 'receipt' || ck.image === 'both';
    const finish = () => { st.cart = []; st.voucher = ''; st.vInput = null; lsSet('trsh_voucher', ''); saveCart(); renderChrome(); renderCart(); };
    if (!wantReceipt) { openChannel(chan.k, msg, subject); finish(); closeAll(); if (ck.confetti) confetti(); return; }
    // dialog langsung tampil (tombol kirim sudah bisa dipakai); gambar struk menyusul begitu selesai dibuat
    finish(); closeAll();
    st.ck = { id, ch: chan.k, msg, subject, blob: null, url: '', pending: true };
    const mine = st.ck;
    ckSheet(); if (ck.confetti) confetti();
    try { const blob = await makeReceipt({ id, time, c }); if (st.ck === mine) { mine.blob = blob; mine.url = blob ? URL.createObjectURL(blob) : ''; } } catch (e) { console.warn('TRSH: struk gagal dibuat', e); }
    mine.pending = false;
    if (st.ck === mine) ckSheet();
  }

  function openCart() {
    st.lastFocus = document.activeElement; st.adjusted = false;
    renderCart(); $('#drawer').classList.add('open'); $('#drawer').setAttribute('aria-hidden', 'false'); $('#scrim').classList.add('on'); lock();
  }
  function closeAll() {
    if (st.open && /^#p-/.test(location.hash)) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    st.open = null;
    $('#drawer').classList.remove('open'); $('#modal').classList.remove('open');
    $('#drawer').setAttribute('aria-hidden', 'true'); $('#modal').setAttribute('aria-hidden', 'true');
    if (popupModal()) closePopup(); // popup sudut/bar boleh tetap tampil; popup tengah ikut tertutup
    $('#scrim').classList.remove('on'); lock();
    if (st.lastFocus && st.lastFocus.focus) { try { st.lastFocus.focus({ preventScroll: true }); } catch (e) {} st.lastFocus = null; }
  }
  function toggleWish(id) {
    const i = st.wish.indexOf(id);
    if (i >= 0) st.wish.splice(i, 1); else { st.wish.push(id); toast('DISIMPAN ♥'); burst(document.querySelector('[data-wish="' + id + '"]')); }
    lsSet('trsh_wish', st.wish);
    renderChrome(); renderShop(); if (st.open) renderModal();
  }
  function applyVoucher() {
    const v = String(($('#vIn') || {}).value || '').trim().toUpperCase();
    st.voucher = v; st.vInput = null; lsSet('trsh_voucher', v); renderCart();
  }

  /* ---------------- popup promo ---------------- */
  const popup = { armed: false, done: false };
  const hash = (str) => { let h = 5381; for (let k = 0; k < str.length; k++) h = ((h << 5) + h + str.charCodeAt(k)) | 0; return (h >>> 0).toString(36); };
  // kunci "sudah dilihat" mengikuti isi popup → popup yang diedit akan tampil lagi ke pengunjung lama
  const popupKey = (p) => 'trsh_pp_' + hash([p.title, p.text, p.code, p.cta, p.image].join('|'));
  function popupAllowed(p) {
    if (!p || !p.enabled || (!p.title && !p.text)) return false;
    if (maintOn()) return false;
    if (p.mobile === false && window.innerWidth < 700) return false;
    if (PREVIEW) return true;
    const k = popupKey(p);
    if (p.frequency === 'once' && ls(k, '')) return false;
    if (p.frequency !== 'always' && p.frequency !== 'once' && ss(k)) return false;
    return true;
  }
  const overlayOpen = () => !!st.open || $('#drawer').classList.contains('open');
  function schedulePopup() {
    if (popup.armed || popup.done || !popupAllowed(S().popup)) return;
    popup.armed = true;
    const p = S().popup, touch = !matchMedia('(pointer:fine)').matches;
    let trig = p.trigger || 'delay'; if (trig === 'exit' && touch) trig = 'delay';
    const undo = []; let timer = 0;
    const stop = () => { undo.forEach((f) => f()); undo.length = 0; clearTimeout(timer); };
    const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); undo.push(() => t.removeEventListener(ev, fn, o)); };
    const fire = () => {
      if (popup.done) return;
      if (overlayOpen()) { timer = setTimeout(fire, 2000); return; } // jangan menimpa modal/keranjang yang sedang terbuka
      stop();
      if (!popupAllowed(S().popup)) { popup.armed = false; return; }
      popup.done = true; showPopup();
    };
    if (trig === 'scroll') {
      on(window, 'scroll', () => { const h = document.documentElement.scrollHeight - innerHeight; if (h > 0 && scrollY / h * 100 >= (Number(p.scrollPct) || 40)) fire(); }, { passive: true });
      timer = setTimeout(fire, 25000); // cadangan untuk halaman yang pendek
    } else if (trig === 'exit') {
      on(document, 'mouseout', (e) => { if (!e.relatedTarget && e.clientY <= 0) fire(); });
    } else timer = setTimeout(fire, Math.max(0, Number(p.delay) || 0) * 1000);
  }
  function showPopup(force) {
    const p = S().popup || {};
    if (!force && !popupAllowed(p)) return;
    st.lastFocus = document.activeElement;
    renderPopup(true);
    if ((p.position || 'center') === 'center') $('#scrim').classList.add('on');
    lock();
    if (!PREVIEW && !force) { const k = popupKey(p); ssSet(k, '1'); lsSet(k, '1'); }
    const x = $('#popup .x'); if (x && popupModal()) setTimeout(() => x.focus({ preventScroll: true }), 80);
  }
  function closePopup() {
    const el = $('#popup'); el.classList.remove('open'); el.setAttribute('aria-hidden', 'true');
    if (!st.open && !$('#drawer').classList.contains('open')) $('#scrim').classList.remove('on');
    lock();
  }
  function renderPopup(open) {
    const el = $('#popup'), p = S().popup || {}, link = T.safeUrl(p.link), img = T.safeImg(p.image);
    const isOpen = open || el.classList.contains('open');
    el.className = 'popup pos-' + (['corner', 'bar'].indexOf(p.position) >= 0 ? p.position : 'center') + (isOpen ? ' open' : '');
    el.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
    setHTML(el, `<div class="pp" role="dialog" aria-label="${esc(p.title)}"><button class="x" data-act="close" aria-label="Close">✕</button>
      ${img ? `<div class="pp-img" style="background-image:url('${esc(img).replace(/'/g, '%27')}')"></div>` : ''}
      <div class="pp-b"><p class="mono kicker">[ ✦ ]</p><h3>${esc(p.title)}</h3><p>${esc(p.text)}</p>
      ${p.code ? `<button class="code mono" data-act="usecode" data-code="${esc(p.code)}">${esc(p.code)} <span>${esc(L('usecode'))}</span></button>` : ''}
      <div class="pp-act">${p.cta ? `<a class="btn solid" href="${esc(link || '#shop')}" data-act="close">${esc(p.cta)} <span>→</span></a>` : ''}${p.closeText ? `<button class="lnk mono" data-act="close">${esc(p.closeText)}</button>` : ''}</div></div></div>`);
  }
  window.TRSH_UI = { showPopup: () => showPopup(true), closePopup };

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
    if ((el = t.closest('[data-rel]'))) { openProduct(el.dataset.rel); return; }
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
      else if (a === 'close') { if (el.closest('#popup')) closePopup(); else closeAll(); }
      else if (a === 'add') { const src = $('#modal .md-main img'); if (addCart(st.open, st.size, st.qty)) { fly(src); closeAll(); setTimeout(openCart, S().effects.flyToCart && !reduced() ? 850 : 250); } }
      else if (a === 'checkout') checkout(el.dataset.ch);
      else if (a === 'zoom') openLB(st.img);
      else if (a === 'lb-close') closeLB();
      else if (a === 'lb-prev') openLB(st.lb - 1);
      else if (a === 'lb-next') openLB(st.lb + 1);
      else if (a === 'sizeguide') { const p = prod(st.open); if (p) sizeGuideSheet(p); }
      else if (a === 'share') { const p = prod(st.open); if (p) shareProduct(p); }
      else if (a === 'sheet-close') closeSheet();
      else if (a === 'ck-open') { if (st.ck) { openChannel(st.ck.ch, st.ck.msg, st.ck.subject); if (st.ck.url) toast('LAMPIRKAN GAMBAR STRUK DI CHAT ✦'); } }
      else if (a === 'ck-share') { if (st.ck && st.ck.blob) navigator.share({ files: [new File([st.ck.blob], 'struk-' + st.ck.id + '.jpg', { type: st.ck.blob.type || 'image/jpeg' })], text: st.ck.msg, title: S().brand.fullName + ' ' + st.ck.id }).catch(() => {}); }
      else if (a === 'ck-copy') { if (st.ck) copyText(st.ck.msg).then((ok) => toast(ok ? 'PESAN DISALIN ✦' : 'GAGAL MENYALIN')); }
      else if (a === 'theme') { st.light = !st.light; lsSet('trsh_light', st.light); applyTheme(); renderChrome(); }
      else if (a === 'more') { st.page++; renderShop(); }
      else if (a === 'menu') { const l = $('#links'); l.classList.toggle('open'); el.setAttribute('aria-expanded', l.classList.contains('open')); }
      else if (a === 'an-close') { ssSet('trsh_an_x', S().announcement.text); renderChrome(); }
      else if (a === 'vapply') applyVoucher();
      else if (a === 'vclear') { st.voucher = ''; st.vInput = null; lsSet('trsh_voucher', ''); renderCart(); }
      else if (a === 'usecode') { st.voucher = el.dataset.code; lsSet('trsh_voucher', st.voucher); renderCart(); toast('KODE ' + st.voucher + ' TERSIMPAN — AKTIF DI BAG ✦'); }
      else if (a === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.id === 'popup') closePopup();
    else if (t.id === 'sheet') closeSheet();
    else if (t.id === 'lb') closeLB();
    else if (t.id === 'scrim' || t.id === 'modal') { closeAll(); closePopup(); }
    if (!t.closest('#links, #menuBtn')) $('#links').classList.remove('open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if ($('#lb').classList.contains('open')) { closeLB(); return; }
      if ($('#sheet').classList.contains('open')) { closeSheet(); return; }
      closeAll(); closePopup(); $('#links').classList.remove('open'); return;
    }
    if ($('#lb').classList.contains('open') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { openLB(st.lb + (e.key === 'ArrowRight' ? 1 : -1)); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('card')) { e.preventDefault(); openProduct(e.target.dataset.id); return; }
    if (e.key === 'Enter' && e.target.id === 'vIn') { e.preventDefault(); applyVoucher(); }
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'vIn') st.vInput = e.target.value;
    else if (e.target.dataset && e.target.dataset.cust) { st.cust[e.target.dataset.cust] = e.target.value; lsSet('trsh_cust', st.cust); }
  });
  // ripple pada tombol
  document.addEventListener('pointerdown', (e) => { const b = e.target.closest && e.target.closest('.btn,.chip,.sz button'); if (b && !b.disabled) { if (getComputedStyle(b).position === 'static') b.style.position = 'relative'; b.style.overflow = 'hidden'; ripple(e, b); } });
  // tombol magnetik (desktop)
  if (matchMedia('(pointer:fine)').matches) {
    document.addEventListener('mousemove', (e) => {
      if (!S().effects.magnetic || reduced()) return;
      const b = e.target.closest && e.target.closest('.btn,.ab,.wa-float');
      if (!b) return;
      const r = b.getBoundingClientRect();
      b.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 12}px,${((e.clientY - r.top) / r.height - 0.5) * 14}px)`;
    });
    document.addEventListener('mouseout', (e) => { const b = e.target.closest && e.target.closest('.btn,.ab,.wa-float'); if (b && b.style.transform) b.style.transform = ''; });
  }
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'nlForm' || e.target.id === 'mForm') {
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
    if (S().effects.parallax) document.documentElement.style.setProperty('--py', Math.min(y, 900) * 0.18 + 'px');
    if (S().effects.marqueeSkew) {
      const dy = y - (st.lastY || 0); st.lastY = y;
      document.documentElement.style.setProperty('--sk', Math.max(-9, Math.min(9, dy * -0.12)) + 'deg');
      clearTimeout(st.skT); st.skT = setTimeout(() => document.documentElement.style.setProperty('--sk', '0deg'), 120);
    }
  }
  addEventListener('scroll', () => { if (!sraf) sraf = requestAnimationFrame(onScroll); }, { passive: true });

  /* ---------------- preloader ---------------- */
  function preload() {
    const pl = $('#preloader');
    if (!S().effects.preloader || PREVIEW) { pl.remove(); document.body.classList.remove('loading'); schedulePopup(); return; }
    let n = 0; const num = $('#plNum'), bar = $('#plBar');
    const iv = setInterval(() => {
      n = Math.min(100, n + Math.ceil(Math.random() * 13));
      num.textContent = String(n).padStart(3, '0'); bar.style.width = n + '%';
      if (n >= 100) {
        clearInterval(iv);
        // tunggu data dari Supabase (maks 3,5 dtk) agar tidak sempat tampil data default
        Promise.race([T.ready, new Promise((r) => setTimeout(r, 3500))]).then(() => {
          setTimeout(() => { pl.classList.add('done'); document.body.classList.remove('loading'); setTimeout(() => pl.remove(), 900); schedulePopup(); }, 260);
        });
      }
    }, 70);
  }

  /* ---------------- render all + realtime ---------------- */
  function renderAll() {
    applyTheme(); applySeo(); renderChrome(); renderHero(); renderMarquee(); renderDrop();
    renderShop(); renderRecent(); renderExtra(); renderAbout(); renderNews(); renderFooter(); heroScramble();
    renderCart(); if (st.open) renderModal();
    reveal(); onScroll(); initTracking();
    if ($('#popup').classList.contains('open')) renderPopup(); else if (PREVIEW) schedulePopup(); // preview: popup langsung terlihat saat admin mengaktifkannya
    sig = pricingSig();
  }
  let raf = 0;
  T.on(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(renderAll); });

  renderAll();
  preload();
  fromHash();
  setTimeout(() => { st.first = false; }, 1500);
  window.addEventListener('storage', (e) => { if (e.key === 'trsh_cart') { st.cart = ls('trsh_cart', []); renderChrome(); renderCart(); } });
})();
