/* SchnittWundeR – Service Worker: macht die App offline nutzbar.
   Seiten: erst Netz, sonst Cache (immer aktuell, offline trotzdem da).
   Bibliotheken, Schriften, Bilder: erst Cache, im Hintergrund auffrischen.
   Supabase (Login, Cloud) läuft nie über den Cache. */
const VER = 'sw-v2';
const CORE = [
  './', 'index.html', 'app.html', 'login.html', 'konto.html', 'impressum.html', 'datenschutz.html',
  'fonts.css', 'favicon.svg', 'supa.js', 'cnc-export.js', 'cnc-export-ui.js',
  'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png',
  'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-600-normal.woff2', 'fonts/barlow-latin-700-normal.woff2',
  'fonts/barlow-condensed-latin-600-normal.woff2', 'fonts/barlow-condensed-latin-700-normal.woff2',
  'fonts/inter-latin-400-normal.woff2', 'fonts/inter-latin-500-normal.woff2', 'fonts/inter-latin-600-normal.woff2', 'fonts/inter-latin-700-normal.woff2'
];
const LIBS = [
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js',
  'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VER);
    // einzeln laden: fehlt eine Datei, klappt der Rest trotzdem
    await Promise.all([...CORE, ...LIBS].map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VER) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (/supabase\.co$/.test(u.hostname)) return; // Login & Cloud nie cachen
  const same = u.origin === self.location.origin;
  if (!same && u.hostname !== 'cdn.jsdelivr.net') return;

  if (r.mode === 'navigate' || (same && /\.html?$|\/$/.test(u.pathname))) {
    e.respondWith((async () => {
      const c = await caches.open(VER);
      const key = u.origin + u.pathname + (u.pathname.endsWith('/') ? 'index.html' : '');
      try {
        const res = await fetch(r);
        if (res.ok && !res.redirected) c.put(key, res.clone());
        return res;
      } catch (err) {
        return (await c.match(key, { ignoreSearch: true }))
          || (await c.match(r, { ignoreSearch: true }))
          || (await c.match('app.html'))
          || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const c = await caches.open(VER);
    const hit = await c.match(r, { ignoreSearch: same });
    const net = fetch(r).then(res => { if (res.ok || res.type === 'opaque') c.put(r, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    return (await net) || new Response('', { status: 504 });
  })());
});
