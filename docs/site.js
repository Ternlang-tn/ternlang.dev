// Tern docs: theme toggle, mobile menu, copy buttons, "on this page" highlight, search.
(function () {
  var root = document.documentElement;
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  document.querySelector('.theme').addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    store('tern-theme', root.dataset.theme);
  });
  document.querySelector('.menu').addEventListener('click', function () { document.body.classList.toggle('open'); });
  document.querySelector('main').addEventListener('click', function () { document.body.classList.remove('open'); });

  document.querySelectorAll('.copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var text = b.parentNode.querySelector('pre').innerText;
      function done(msg) { b.textContent = msg; setTimeout(function () { b.textContent = 'Copy'; }, 1400); }
      function fallback() {
        var r = document.createRange(); r.selectNodeContents(b.parentNode.querySelector('pre'));
        var s = getSelection(); s.removeAllRanges(); s.addRange(r); done('Selected');
      }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(function () { done('Copied'); }, fallback);
      else fallback();
    });
  });

  // highlight the section being read in "On this page"
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc a'));
  if (links.length && 'IntersectionObserver' in window) {
    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && byId[e.target.id]) {
          links.forEach(function (a) { a.classList.remove('on'); });
          byId[e.target.id].classList.add('on');
        }
      });
    }, { rootMargin: '-70px 0px -70% 0px' });
    document.querySelectorAll('article h2[id], article h3[id]').forEach(function (h) { obs.observe(h); });
  }

  // search: every section of every page, scored by where the words appear
  var input = document.querySelector('.search input'), box = document.querySelector('.results');
  var index = window.TERN_SEARCH || [], picked = 0;
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function mark(s, words) {
    var out = esc(s);
    words.forEach(function (w) { if (w) out = out.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
    return out;
  }
  function run() {
    var q = input.value.trim().toLowerCase();
    if (!q) { box.hidden = true; return; }
    var words = q.split(/\s+/);
    var hits = [];
    index.forEach(function (e) {
      var h = e.h.toLowerCase(), t = e.t.toLowerCase(), p = e.p.toLowerCase(), score = 0;
      for (var i = 0; i < words.length; i++) {
        var w = words[i], s = 0;
        if (h === w) s += 30; else if (h.indexOf(w) >= 0) s += 12;
        if (p.indexOf(w) >= 0) s += 4;
        if (t.indexOf(w) >= 0) s += 2 + Math.min(3, t.split(w).length - 1);
        if (!s) return;
        score += s;
      }
      hits.push([score, e]);
    });
    hits.sort(function (a, b) { return b[0] - a[0]; });
    hits = hits.slice(0, 12);
    picked = 0;
    box.innerHTML = hits.length ? hits.map(function (x, i) {
      var e = x[1], t = e.t, at = t.toLowerCase().indexOf(words[0]);
      var snip = at > 60 ? '…' + t.slice(at - 50, at + 130) : t.slice(0, 180);
      return '<a href="' + (window.TERN_ROOT || '') + e.u + '"' + (i === 0 ? ' class="on"' : '') + '><div class="rp">' + esc(e.p) +
        '</div><div class="rh">' + mark(e.h, words) + '</div><div class="rt">' + mark(snip, words) + '</div></a>';
    }).join('') : '<div class="none">Nothing matches “' + esc(q) + '”.</div>';
    box.hidden = false;
  }
  input.addEventListener('input', run);
  input.addEventListener('keydown', function (ev) {
    var items = box.querySelectorAll('a');
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!items.length) return;
      items[picked].classList.remove('on');
      picked = (picked + (ev.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[picked].classList.add('on'); items[picked].scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Enter' && items[picked]) { location.href = items[picked].href; }
    else if (ev.key === 'Escape') { input.value = ''; box.hidden = true; input.blur(); }
  });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === '/' && document.activeElement !== input) { ev.preventDefault(); input.focus(); }
  });
  document.addEventListener('click', function (ev) { if (!ev.target.closest('.search')) box.hidden = true; });
})();
