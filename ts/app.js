// The ternts page: the playground and "run it on a whole project". ternts (and tsc, when
// asked) run in worker.js; this file reads folders, GitHub repositories and the bundled
// samples, and shows the results.
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };

  // ------------------------------------------------------------ the worker
  var worker = new Worker('worker.js'), seq = 0, pending = {};
  worker.onmessage = function (e) {
    var m = e.data, p = pending[m.id];
    if (!p) return;
    if (m.type === 'progress') { if (p.progress) p.progress(m); return; }
    delete pending[m.id];
    p.resolve(m);
  };
  function call(msg, progress) {
    return new Promise(function (resolve) {
      var id = ++seq;
      pending[id] = { resolve: resolve, progress: progress };
      msg.id = id;
      worker.postMessage(msg);
    });
  }

  function ms(t) {
    if (t < 1) return t.toFixed(2) + ' ms';
    if (t < 1000) return (t < 10 ? t.toFixed(1) : Math.round(t)) + ' ms';
    return (t / 1000).toFixed(2) + ' s';
  }
  function size(n) { return n < 1e6 ? Math.round(n / 1e3) + ' KB' : (n / 1e6).toFixed(1) + ' MB'; }
  function esc(s) { return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(n) { return n.toLocaleString('en-US'); }

  // ------------------------------------------------------------ playground
  var presets = {
    nest: ['cats.controller.ts', [
      "import { Body, Controller, Get, Param, Post } from '@nestjs/common';",
      "import { CatsService } from './cats.service';",
      "import { CreateCatDto } from './dto/create-cat.dto';",
      "import type { Cat } from './interfaces/cat.interface';",
      "",
      "@Controller('cats')",
      "export class CatsController {",
      "  constructor(private readonly catsService: CatsService) {}",
      "",
      "  @Post()",
      "  async create(@Body() createCatDto: CreateCatDto): Promise<void> {",
      "    this.catsService.create(createCatDto);",
      "  }",
      "",
      "  @Get(':id')",
      "  findOne(@Param('id') id: string): Cat {",
      "    return this.catsService.findOne(+id);",
      "  }",
      "}"]],
    react: ['Counter.tsx', [
      "import { useState } from 'react';",
      "",
      "type Props = { initial?: number; label: string };",
      "",
      "export function Counter({ initial = 0, label }: Props) {",
      "  const [count, setCount] = useState<number>(initial);",
      "  return (",
      "    <button className=\"counter\" onClick={() => setCount(c => c + 1)}>",
      "      {label}: <b>{count}</b>",
      "    </button>",
      "  );",
      "}"]],
    enums: ['shapes.ts', [
      "export enum Direction { Up = 1, Down, Left, Right }",
      "",
      "export namespace Geometry {",
      "  export interface Point { x: number; y: number }",
      "  export const origin: Point = { x: 0, y: 0 };",
      "  export function dist(a: Point, b: Point = origin): number {",
      "    return Math.hypot(a.x - b.x, a.y - b.y);",
      "  }",
      "}",
      "",
      "export class Queue<T> {",
      "  #items: T[] = [];",
      "  constructor(public readonly name: string, private limit = 100) {}",
      "  push(item: T): this {",
      "    if (this.#items.length < this.limit) this.#items.push(item);",
      "    return this;",
      "  }",
      "}",
      "",
      "export const heading = Direction.Left satisfies Direction;"]],
    using: ['resources.ts', [
      "class Settings {",
      "  accessor level: 'debug' | 'info' = 'info';",
      "  static accessor instances = 0;",
      "}",
      "",
      "export async function readConfig(path: string) {",
      "  await using file = await openFile(path);",
      "  using lock = acquireLock(path);",
      "  return JSON.parse(await file.text()) as Record<string, unknown>;",
      "}",
      "",
      "declare function openFile(p: string): Promise<AsyncDisposable & { text(): Promise<string> }>;",
      "declare function acquireLock(p: string): Disposable;"]],
  };

  var src = $('#pg-src'), file = $('#pg-file'), out = $('#pg-out'), status = $('#pg-status');
  var tscBtn = document.querySelector('[data-out="tsc"]'), terntsBtn = document.querySelector('[data-out="ternts"]');
  var last = null, showing = 'ternts', timer = 0, running = false, again = false;

  function show(which) {
    showing = which;
    terntsBtn.setAttribute('aria-pressed', which === 'ternts');
    tscBtn.setAttribute('aria-pressed', which === 'tsc');
    if (!last) return;
    if (which === 'tsc' && last.tsc) out.textContent = last.tsc.code;
    else out.textContent = last.err ? 'error: ' + last.err : last.code;
    out.classList.toggle('bad', !!last.err && which === 'ternts');
  }
  terntsBtn.onclick = function () { show('ternts'); };
  tscBtn.onclick = function () { show('tsc'); };

  function runPlayground() {
    if (running) { again = true; return; }
    running = true;
    var wantTsc = $('#pg-tsc').checked;
    call({ type: 'one', src: src.value, file: file.value || 'input.ts', esm: $('#pg-module').value === 'esm', define: $('#pg-define').checked, tsc: wantTsc },
      function (p) { status.textContent = p.phase; }).then(function (r) {
      running = false;
      if (r.fatal) { status.textContent = r.fatal; return; }
      last = r;
      tscBtn.hidden = !r.tsc;
      if (!r.tsc && showing === 'tsc') showing = 'ternts';
      var s = 'ternTS ' + ms(r.ms);
      if (r.tsc) s += ' · tsc ' + ms(r.tsc.ms) + (r.err ? '' : r.tsc.same ? ' · ✓ same program' : ' · ✗ outputs differ');
      if (r.err) s += ' · syntax error';
      status.textContent = s;
      status.className = 'status' + (r.err ? ' warn' : r.tsc ? (r.tsc.same ? ' good' : ' warn') : '');
      show(showing);
      if (again) { again = false; runPlayground(); }
    });
  }
  function soon() { clearTimeout(timer); timer = setTimeout(runPlayground, 120); }
  src.addEventListener('input', soon);
  file.addEventListener('input', soon);
  ['#pg-module', '#pg-define', '#pg-tsc'].forEach(function (s) { $(s).addEventListener('change', runPlayground); });
  src.addEventListener('keydown', function (e) {                 // Tab indents instead of leaving
    if (e.key !== 'Tab' || e.shiftKey) return;
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
  });

  function load(name, text) {
    file.value = name;
    src.value = text;
    runPlayground();
  }
  document.querySelectorAll('[data-preset]').forEach(function (b) {
    b.onclick = function () {
      document.querySelectorAll('[data-preset]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      var p = presets[b.dataset.preset];
      load(p[0], p[1].join('\n') + '\n');
    };
  });
  load(presets.nest[0], presets.nest[1].join('\n') + '\n');

  // ------------------------------------------------------------ folders, repositories, samples
  var SKIP = /(^|\/)(node_modules|\.git|dist|build|out|coverage|\.next|\.turbo)(\/|$)/;
  function wanted(path) { return /\.(ts|tsx|mts|cts)$/.test(path) && !/\.d\.[mc]?tsx?$/.test(path) && !SKIP.test(path); }
  var MAX_FILES = 6000;
  var files = [], sourceName = '';

  var results = $('#results'), progress = $('#progress'), summary = $('#summary');
  function setProgress(text, done, total) {
    progress.hidden = false;
    progress.querySelector('.progress-text').textContent = text;
    progress.querySelector('i').style.width = total ? (100 * done / total).toFixed(1) + '%' : '0';
  }
  function fail(msg) {
    results.hidden = false;
    progress.hidden = true;
    summary.innerHTML = '<p class="fail">' + esc(msg) + '</p>';
  }

  // Read File objects with their paths, a few at a time
  function readAll(list) {
    var picked = list.filter(function (f) { return wanted(f.path); });
    if (!picked.length) return Promise.reject(new Error('No .ts or .tsx files there (node_modules, dist and .d.ts files are skipped).'));
    var capped = picked.length > MAX_FILES;
    picked = picked.slice(0, MAX_FILES);
    var done = 0;
    return Promise.all(picked.map(function (f) {
      return f.file.text().then(function (t) {
        done++;
        if ((done & 63) === 0) setProgress('Reading files…', done, picked.length);
        return { path: f.path, src: t };
      });
    })).then(function (r) { r.capped = capped; return r; });
  }

  $('#pick').addEventListener('change', function (e) {
    var list = Array.prototype.map.call(e.target.files, function (f) { return { path: f.webkitRelativePath || f.name, file: f }; });
    var top = list.length ? list[0].path.split('/')[0] : 'folder';
    start(top, readAll(list));
    e.target.value = '';
  });

  var drop = $('#drop');
  drop.addEventListener('dragover', function (e) { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', function () { drop.classList.remove('over'); });
  drop.addEventListener('drop', function (e) {
    e.preventDefault();
    drop.classList.remove('over');
    var entries = Array.prototype.map.call(e.dataTransfer.items, function (i) { return i.webkitGetAsEntry && i.webkitGetAsEntry(); }).filter(Boolean);
    if (!entries.length) return;
    var list = [];
    function walk(entry) {
      if (entry.isFile) {
        if (!wanted(entry.fullPath.slice(1))) return Promise.resolve();
        return new Promise(function (res) { entry.file(function (f) { list.push({ path: entry.fullPath.slice(1), file: f }); res(); }, function () { res(); }); });
      }
      if (SKIP.test(entry.fullPath.slice(1))) return Promise.resolve();
      var reader = entry.createReader();
      return new Promise(function (res) {
        var all = [];
        (function more() {                                    // readEntries returns batches
          reader.readEntries(function (batch) {
            if (!batch.length) return Promise.all(all.map(walk)).then(res);
            all = all.concat(Array.prototype.slice.call(batch));
            more();
          }, function () { res(); });
        })();
      });
    }
    setProgress('Finding files…', 0, 0);
    results.hidden = false;
    start(entries.length === 1 ? entries[0].name : 'dropped files', Promise.all(entries.map(walk)).then(function () { return readAll(list); }));
  });

  // owner/repo, owner/repo/sub/dir, or a github.com URL (…/tree/BRANCH/sub/dir)
  function parseRepo(s) {
    s = s.trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
    var parts = s.split('/').filter(Boolean);
    if (parts.length < 2) return null;
    var ref = 'HEAD', rest = parts.slice(2);
    if (rest[0] === 'tree' && rest.length >= 2) { ref = rest[1]; rest = rest.slice(2); }
    return { owner: parts[0], repo: parts[1], ref: ref, dir: rest.join('/') };
  }

  function fromGitHub(spec) {
    var r = parseRepo(spec);
    if (!r) return Promise.reject(new Error('Give a repository as owner/repo, e.g. nestjs/nest.'));
    setProgress('Listing ' + r.owner + '/' + r.repo + '…', 0, 0);
    return fetch('https://api.github.com/repos/' + r.owner + '/' + r.repo + '/git/trees/' + encodeURIComponent(r.ref) + '?recursive=1')
      .then(function (res) {
        if (res.status === 403 || res.status === 429) throw new Error('GitHub’s rate limit for listing repositories (60 an hour per address) is used up. Try again later, or download the repository and drop the folder here.');
        if (!res.ok) throw new Error('Couldn’t list ' + r.owner + '/' + r.repo + ' (' + res.status + '): is it public, and spelled right?');
        return res.json();
      })
      .then(function (tree) {
        var prefix = r.dir ? r.dir + '/' : '';
        var paths = tree.tree.filter(function (t) { return t.type === 'blob' && t.path.indexOf(prefix) === 0 && wanted(t.path); }).map(function (t) { return t.path; });
        if (!paths.length) throw new Error('No .ts or .tsx files in ' + spec + '.');
        var capped = paths.length > MAX_FILES || tree.truncated;
        paths = paths.slice(0, MAX_FILES);
        var out = new Array(paths.length), next = 0, done = 0;
        function one() {
          if (next >= paths.length) return Promise.resolve();
          var i = next++;
          return fetch('https://raw.githubusercontent.com/' + r.owner + '/' + r.repo + '/' + tree.sha + '/' + paths[i].split('/').map(encodeURIComponent).join('/'))
            .then(function (res) { if (!res.ok) throw new Error('Couldn’t fetch ' + paths[i] + ' (' + res.status + ')'); return res.text(); })
            .then(function (t) {
              out[i] = { path: paths[i], src: t };
              done++;
              if ((done & 15) === 0 || done === paths.length) setProgress('Downloading ' + num(done) + ' of ' + num(paths.length) + ' files from GitHub…', done, paths.length);
              return one();
            });
        }
        var lanes = [];
        for (var k = 0; k < 24; k++) lanes.push(one());
        return Promise.all(lanes).then(function () { out.capped = capped; return out; });
      });
  }

  $('#gh').addEventListener('submit', function (e) {
    e.preventDefault();
    var v = $('#gh-repo').value;
    start(v.trim(), fromGitHub(v));
  });
  document.querySelectorAll('[data-repo]').forEach(function (b) {
    b.onclick = function () { $('#gh-repo').value = b.dataset.repo; start(b.dataset.repo, fromGitHub(b.dataset.repo)); };
  });
  $('#sample').onclick = function () {
    start('NestJS samples', fetch('nest-samples.json').then(function (r) { return r.json(); }).then(function (j) { return j.files; }));
  };

  var busy = false;
  function start(name, loading) {
    if (busy) return;
    busy = true;
    results.hidden = false;
    summary.innerHTML = '';
    setProgress('Loading ' + name + '…', 0, 0);
    results.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    loading.then(function (list) {
      files = list;
      sourceName = name;
      return transpileAll(list.capped);
    }).catch(function (e) { fail(e.message || String(e)); }).then(function () { busy = false; });
  }

  function transpileAll(capped) {
    var wantTsc = $('#f-tsc').checked, n = files.length;
    setProgress('ternTS: 0 of ' + num(n), 0, n);
    return call({ type: 'many', files: files, esm: $('#f-module').value === 'esm', define: $('#f-define').checked, tsc: wantTsc, swc: $('#f-swc').checked }, function (p) {
      setProgress(p.total ? p.phase + ': ' + num(p.done) + ' of ' + num(p.total) : p.phase, p.done, p.total);
    }).then(function (r) {
      progress.hidden = true;
      if (r.fatal) return fail(r.fatal);
      render(r, capped);
    });
  }

  function render(r, capped) {
    var n = files.length, ok = n - r.errors;
    var h = '<div class="res-head"><b>' + esc(sourceName) + '</b><span>' + num(n) + ' files · ' + size(r.bytes) + (capped ? ' · capped at the first ' + num(MAX_FILES) + ' files' : '') + '</span></div>';
    h += '<div class="stats res-stats">';
    h += '<div class="stat"><b>' + ms(r.ternMs) + '</b><span>ternTS, all files</span><small>' + (r.bytes / 1e6 / (r.ternMs / 1000)).toFixed(1) + ' MB/s in WebAssembly</small></div>';
    if (r.swcMs !== undefined)
      h += '<div class="stat hi"><b>' + (r.swcMs / r.ternMs).toFixed(1) + '&times;</b><span>faster than swc</span><small>swc ' + ms(r.swcMs) + ', its WebAssembly build in the same worker</small></div>';
    if (r.tscMs !== undefined) {
      h += '<div class="stat hi"><b>' + (r.tscMs / r.ternMs).toFixed(1) + '&times;</b><span>faster than tsc</span><small>tsc ' + ms(r.tscMs) + ', TypeScript 5.9 <code class="plain">transpileModule</code></small></div>';
      h += '<div class="stat ' + (r.same === n ? 'hi' : '') + '"><b>' + num(r.same) + ' / ' + num(n) + '</b><span>the same program as tsc</span><small>' + (r.same === n ? 'every file' : num(n - r.same) + ' differ (listed below)') + '</small></div>';
    } else {
      h += '<div class="stat"><b>' + num(ok) + ' / ' + num(n) + '</b><span>transpiled</span><small>' + (r.errors ? num(r.errors) + ' with errors' : 'no errors') + '</small></div>';
    }
    h += '</div>';
    if (r.tscMs !== undefined || r.swcMs !== undefined) {
      var max = Math.max(r.ternMs, r.tscMs || 0, r.swcMs || 0);
      h += '<figure class="chart res-chart" style="--max:' + max + '"><figcaption><b>Time to transpile ' + num(n) + ' files</b><span>shorter is better</span></figcaption>' +
        '<div class="row tern"><span>ternTS</span><i style="--v:' + r.ternMs + '"></i><em>' + ms(r.ternMs) + '</em></div>' +
        (r.swcMs !== undefined ? '<div class="row"><span>swc</span><i style="--v:' + r.swcMs + '"></i><em>' + ms(r.swcMs) + '</em></div>' : '') +
        (r.tscMs !== undefined ? '<div class="row"><span>tsc</span><i style="--v:' + r.tscMs + '"></i><em>' + ms(r.tscMs) + '</em></div>' : '') +
        '</figure>';
    }
    var odd = [];
    files.forEach(function (f, i) {
      var o = r.outputs[i];
      if (o.err) odd.push({ i: i, why: o.err });
    });
    if (r.diffs) r.diffs.forEach(function (p) {
      var i = files.findIndex(function (f) { return f.path === p; });
      if (!r.outputs[i].err) odd.push({ i: i, why: 'output differs from tsc' });
    });
    h += '<div class="res-actions"><button class="btn primary" id="zip">Download the JavaScript (.zip)</button></div>';
    if (odd.length) {
      h += '<h3 class="odd-h">Files to look at</h3><p class="note">Click one to open it in the playground with tsc beside it. A file that isn’t valid TypeScript gets an error from ternTS where tsc emits something anyway. If a valid file differs, that’s a ternTS bug: we’d like to hear about it.</p><ul class="odd">';
      odd.slice(0, 100).forEach(function (o) { h += '<li><button data-i="' + o.i + '"><code class="plain">' + esc(files[o.i].path) + '</code><span>' + esc(o.why) + '</span></button></li>'; });
      h += '</ul>';
      if (odd.length > 100) h += '<p class="note">…and ' + num(odd.length - 100) + ' more.</p>';
    }
    summary.innerHTML = h;
    $('#zip').onclick = function () { download(r.outputs); };
    summary.querySelectorAll('[data-i]').forEach(function (b) {
      b.onclick = function () {
        var f = files[+b.dataset.i];
        $('#pg-tsc').checked = true;
        $('#pg-module').value = $('#f-module').value;
        $('#pg-define').checked = $('#f-define').checked;
        document.querySelectorAll('[data-preset]').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
        load(f.path.split('/').pop(), f.src);
        $('#try').scrollIntoView({ behavior: 'smooth' });
      };
    });
  }

  // ------------------------------------------------------------ zip (stored, no compression)
  var CRC = (function () {
    var t = new Uint32Array(256);
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zip(entries) {
    var enc = new TextEncoder(), parts = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var name = enc.encode(e.name), data = enc.encode(e.text), crc = crc32(data);
      var h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true);
      h.setUint16(12, 33, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true);
      h.setUint16(26, name.length, true);
      var c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
      c.setUint16(14, 33, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
      c.setUint16(28, name.length, true); c.setUint32(42, offset, true);
      parts.push(h.buffer, name, data);
      central.push(c.buffer, name);
      offset += 30 + name.length + data.length;
    });
    var size = central.reduce(function (s, b) { return s + b.byteLength; }, 0);
    var end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true);
    end.setUint32(12, size, true); end.setUint32(16, offset, true);
    return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
  }
  function download(outputs) {
    var entries = [];
    files.forEach(function (f, i) {
      if (outputs[i].code === undefined) return;
      entries.push({ name: f.path.replace(/\.tsx?$/, '.js').replace(/\.mts$/, '.mjs').replace(/\.cts$/, '.cjs'), text: outputs[i].code });
    });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(zip(entries));
    a.download = (sourceName.replace(/[^\w.-]+/g, '-') || 'ternts') + '-js.zip';
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
})();
