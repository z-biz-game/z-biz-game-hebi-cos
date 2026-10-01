'use strict';
// network-first 的离线壳：能联网就取网络、顺手回填缓存；断网时回落到上次成功抓取的资源。
// 刻意不做 cache-first——被旧缓存钉住的那次线上事故，比没有离线能力更糟。
//
// CACHE 带版本号，activate 时清掉所有别的版本：改了代码不需要玩家"清缓存"。
var VERSION = 'v1';
var CACHE = 'hebi-ichigo-' + VERSION;
var SHELL = 'index.html';

self.addEventListener('install', function () { self.skipWaiting(); });

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  // 只碰同源：图标若被 CDN 改写、或页面嵌了第三方资源，一概不动。
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok) {
        caches.open(CACHE).then(function (c) {
          c.put(req, res.clone()).catch(function () {});
          // 导航响应再按 SHELL 这个固定键存一份：断网时地址栏可能带着上一轮的查询串，
          // 只按原请求 URL 存的那一份就永远命中不了，离线打开依旧白屏。
          if (req.mode === 'navigate') c.put(SHELL, res.clone()).catch(function () {});
        });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || (req.mode === 'navigate' ? caches.match(SHELL) : Response.error());
      });
    })
  );
});
