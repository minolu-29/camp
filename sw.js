/* CAMP LAB service worker: アプリ本体と写真をキャッシュしてオフラインでも開けるようにする */
const VERSION = 'camplab-v2026-11-17';
const CORE = ['./', './index.html', './manifest.json', './privacy.html', './img/peg-hammer.jpg'];
const RUNTIME = 'camplab-runtime';
const MAX_RUNTIME = 300;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== RUNTIME).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim() {
  const c = await caches.open(RUNTIME);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // ページ本体: まずネット、だめならキャッシュ
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 動画の埋め込みはキャッシュしない
  if (/youtube\.com|youtube-nocookie\.com|googlevideo\.com/.test(url.hostname)) return;

  const cacheable = url.origin === self.location.origin ||
    /images\.unsplash\.com|upload\.wikimedia\.org|i\.ytimg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com/.test(url.hostname);
  if (!cacheable) return;

  // 写真・フォント: キャッシュがあれば即表示し、裏で更新
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) {
          const copy = res.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy)).then(trim);
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
