'use strict';
// 注册要静默失败：file:// 下、旧 Safari、无痕窗口都拿不到 serviceWorker，
// 那不是玩家的错，不该在控制台抛红。
//
// 但"静默"不等于"没有读数"。`可安装` 这条判据在门禁里问的是**装上了没有**，
// 不是"文件里有没有 register 字样"——所以把结果留在 window.pwaStatus，由 main.js
// 挂到 window.hebi.pwa() 上给浏览器腿读。
window.pwaStatus = { supported: 'serviceWorker' in navigator, registered: false, scope: null, error: '' };

if (window.pwaStatus.supported && location.protocol.indexOf('http') === 0) {
  window.addEventListener('load', function () {
    // 相对路径而不是 '/sw.js'：Pages 在 /z-biz-game-hebi-cos/ 前缀下发布、本地跑在根下，
    // 两种形态都要注册成功，作用域跟着 sw.js 所在目录走（server.cjs 两种形态都答）。
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      window.pwaStatus.registered = true;
      window.pwaStatus.scope = reg.scope;
    }).catch(function (err) {
      window.pwaStatus.error = String((err && err.message) || err);
    });
  });
}
