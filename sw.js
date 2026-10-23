// 홈 화면 앱용 도우미: 페이지는 항상 인터넷에서 새로 받고(최신 묵상), 인터넷이 끊겼을 때만 마지막으로 본 화면을 보여 줍니다.
const CACHE = "devotion-pages-v1";
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(new URL(req.url).pathname, copy));
        }
        return res;
      })
      .catch(() => caches.match(new URL(req.url).pathname).then((hit) => hit || caches.match("/index.html") || caches.match("/")))
  );
});
