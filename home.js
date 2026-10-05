// ternlang.dev pages outside the docs: theme toggle (shared with the docs through localStorage) and copy buttons.
(function () {
  var root = document.documentElement;
  var theme = document.querySelector('.theme');
  if (theme) theme.addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('tern-theme', root.dataset.theme); } catch (e) {}
  });
  document.querySelectorAll('.block.code').forEach(function (block) {
    var b = document.createElement('button');
    b.className = 'copy'; b.textContent = 'Copy';
    b.addEventListener('click', function () {
      var text = block.querySelector('pre').innerText;
      function done(msg) { b.textContent = msg; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done('Copied'); }, function () { done('Select'); });
    });
    block.appendChild(b);
  });
})();
// hero example tabs (arrow keys move between them)
(function () {
  var tabs = Array.prototype.slice.call(document.querySelectorAll('.hero-tabs [role="tab"]'));
  function pick(t) {
    tabs.forEach(function (x) {
      var on = x === t;
      x.setAttribute('aria-selected', on);
      x.tabIndex = on ? 0 : -1;
      document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { pick(t); });
    t.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      var n = tabs[(i + d + tabs.length) % tabs.length];
      pick(n); n.focus();
    });
  });
})();
