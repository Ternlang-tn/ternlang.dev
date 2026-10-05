// ternts in the browser: ternts.wasm (the same build as ternts/js/wasm.cjs) runs here, off the
// page's thread; tsc (TypeScript 5.9's transpileModule) and acorn load only when asked for.
//
// Messages in:  {id, type: 'one', src, file, esm, define, tsc}
//               {id, type: 'many', files: [{path, src}], esm, define, tsc}
// Messages out: {id, type: 'progress', done, total, phase} ... then {id, type: 'result', ...}
'use strict';
const TS_URL = 'https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.js';
const ACORN_URL = 'https://cdn.jsdelivr.net/npm/acorn@8.15.0/dist/acorn.js';
const enc = new TextEncoder(), dec = new TextDecoder();

let x = null, memory = null;

// The WASI calls a Tern library makes: printing (none expected), clocks, random numbers.
function wasi() {
  const ENOSYS = 52, EBADF = 8;
  const view = () => new DataView(memory.buffer);
  const fns = {
    fd_write(fd, iovs, n, written) {
      const v = view();
      let total = 0;
      for (let i = 0; i < n; i++) total += v.getUint32(iovs + i * 8 + 4, true);
      v.setUint32(written, total, true);
      return 0;
    },
    fd_fdstat_get(fd, stat) {
      if (fd > 2) return EBADF;
      const v = view();
      v.setUint8(stat, 2); v.setUint16(stat + 2, 0, true);
      v.setBigUint64(stat + 8, 0n, true); v.setBigUint64(stat + 16, 0n, true);
      return 0;
    },
    environ_sizes_get(c, s) { const v = view(); v.setUint32(c, 0, true); v.setUint32(s, 0, true); return 0; },
    environ_get: () => 0,
    args_sizes_get(c, s) { const v = view(); v.setUint32(c, 0, true); v.setUint32(s, 0, true); return 0; },
    args_get: () => 0,
    clock_time_get(id, precision, time) {
      const ns = id === 0 ? BigInt(Date.now()) * 1000000n : BigInt(Math.round(performance.now() * 1e6));
      view().setBigUint64(time, ns, true);
      return 0;
    },
    clock_res_get(id, res) { view().setBigUint64(res, 1000n, true); return 0; },
    random_get(buf, len) { crypto.getRandomValues(new Uint8Array(memory.buffer, buf, len)); return 0; },
    fd_close: () => 0, sched_yield: () => 0,
    proc_exit(code) { throw new Error('ternts.wasm exited (' + code + ')'); },
  };
  return new Proxy(fns, { get: (t, k) => t[k] || (() => ENOSYS) });
}

async function load() {
  if (x) return;
  const res = await fetch('ternts.wasm');
  const { instance } = await WebAssembly.instantiate(await res.arrayBuffer(), { wasi_snapshot_preview1: wasi() });
  x = instance.exports;
  memory = x.memory;
  if (x._initialize) x._initialize();
}

function put(s) {
  const b = enc.encode(s);
  const p = x.tern_alloc(BigInt(b.length + 1));
  const m = new Uint8Array(memory.buffer, p, b.length + 1);
  m.set(b);
  m[b.length] = 0;
  return p;
}

// wasm.tn's transpile: "<err bytes> <code bytes> <map bytes>\n" err code map
function ternts(src, file, esm, define) {
  let stand = null;                      // a NUL can't cross into wasm: stand in for it
  if (src.includes('\0')) {
    for (let k = 0xF0000; stand === null || src.includes(stand); k++) stand = String.fromCodePoint(k);
    src = src.split('\0').join(stand);
  }
  const ps = [put(src), put(file), put(define ? '{"$define":true}' : '{}')];
  let r;
  try { r = x.transpile(ps[0], ps[1], esm ? 1 : 0, 0, ps[2]); }
  finally { for (const p of ps) x.tern_free(p); }
  const err = x.tern_last_error();
  if (err) {
    const m = new Uint8Array(memory.buffer);
    let e = err;
    while (m[e]) e++;
    return { err: dec.decode(m.slice(err, e)) };
  }
  const m = new Uint8Array(memory.buffer);
  let nl = r;
  while (m[nl] !== 10) nl++;
  const [el, cl] = dec.decode(m.slice(r, nl)).split(' ').map(Number);
  const e = dec.decode(m.slice(nl + 1, nl + 1 + el));
  let code = dec.decode(m.slice(nl + 1 + el, nl + 1 + el + cl));
  x.tern_free(r);
  if (stand) code = code.split(stand).join('\0');
  return e ? { err: e } : { code };
}

let tscReady = false;
function loadTsc(id) {
  if (tscReady) return;
  postMessage({ id, type: 'progress', phase: 'Loading TypeScript 5.9 from jsDelivr (about 3 MB)…', done: 0, total: 0 });
  importScripts(TS_URL, ACORN_URL);
  tscReady = true;
}

// tsc with the options ternts uses by default, as harness/tscheck.mjs runs it
function tsc(src, file, esm, define) {
  const o = {
    module: esm ? ts.ModuleKind.ESNext : ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2023,
    experimentalDecorators: true, emitDecoratorMetadata: true, useDefineForClassFields: !!define,
    jsx: ts.JsxEmit.ReactJSX, removeComments: true,
  };
  return ts.transpileModule(src, { fileName: file, compilerOptions: o, reportDiagnostics: false }).outputText;
}

// harness/tscheck.mjs's comparison: the same AST, ignoring positions, raw text, and the
// numbering of temp names (_a, _1)
const TEMP = /^_[a-z]$|^_\d+$/;
function parse(code) {
  try { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true }); }
  catch (e) { return acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'module', allowReturnOutsideFunction: true, allowHashBang: true, allowAwaitOutsideFunction: true }); }
}
function norm(code) {
  return JSON.stringify(parse(code), (k, v) => {
    if (k === 'start' || k === 'end' || k === 'raw') return undefined;
    if (typeof v === 'bigint') return v.toString() + 'n';
    if (v && v.type === 'Identifier' && TEMP.test(v.name)) return { type: 'Identifier', name: '_T' };
    if (v && v.type === 'ExpressionStatement' && v.directive) { const { directive, ...r } = v; return r; }
    return v;
  });
}
function same(a, b) { try { return norm(a) === norm(b); } catch (e) { return false; } }

onmessage = async (ev) => {
  const q = ev.data;
  try {
    await load();
    if (q.type === 'one') {
      const t0 = performance.now();
      const r = ternts(q.src, q.file, q.esm, q.define);
      const out = { id: q.id, type: 'result', ...r, ms: performance.now() - t0 };
      if (q.tsc) {
        loadTsc(q.id);
        const t1 = performance.now();
        const want = tsc(q.src, q.file, q.esm, q.define);
        out.tsc = { code: want, ms: performance.now() - t1, same: r.code !== undefined && same(r.code, want) };
      }
      postMessage(out);
      return;
    }
    const files = q.files, n = files.length, outputs = new Array(n);
    let bytes = 0, errors = 0;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      outputs[i] = ternts(files[i].src, files[i].path, q.esm, q.define);
      bytes += files[i].src.length;
      if (outputs[i].err) errors++;
      if ((i & 63) === 63) postMessage({ id: q.id, type: 'progress', phase: 'ternTS', done: i + 1, total: n });
    }
    const ternMs = performance.now() - t0;
    const result = { id: q.id, type: 'result', outputs, ternMs, bytes, errors };
    if (q.tsc) {
      loadTsc(q.id);
      const want = new Array(n);
      const t1 = performance.now();
      for (let i = 0; i < n; i++) {
        want[i] = tsc(files[i].src, files[i].path, q.esm, q.define);
        if ((i & 15) === 15) postMessage({ id: q.id, type: 'progress', phase: 'tsc', done: i + 1, total: n });
      }
      result.tscMs = performance.now() - t1;
      let ok = 0; const diffs = [];
      for (let i = 0; i < n; i++) {
        if (outputs[i].code !== undefined && same(outputs[i].code, want[i])) ok++;
        else diffs.push(files[i].path);
        if ((i & 31) === 31) postMessage({ id: q.id, type: 'progress', phase: 'comparing ASTs', done: i + 1, total: n });
      }
      result.same = ok;
      result.diffs = diffs;
    }
    postMessage(result);
  } catch (e) {
    postMessage({ id: q.id, type: 'result', fatal: String(e && e.message || e) });
  }
};
