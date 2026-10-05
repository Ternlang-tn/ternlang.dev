// tsgo in the browser: TypeScript 7 (typescript-go) compiled to WebAssembly by the unofficial
// tsgo-wasm package (Apache-2.0), run on an in-memory copy of the project. Go's wasm runtime
// does its file I/O through a Node-style `fs` object, so this file provides one (memfs) along
// with a small `process`, then the Go runtime glue from tsgo-wasm's launcher, unchanged.
//
//   const r = await runTsgo(wasmBytes, files, { esm, define })   // files: [{path, src}]
//   r = { ms, exitCode, outputs: {path: js}, stdout }
'use strict';
(function () {
const ENOENT = 'ENOENT', EEXIST = 'EEXIST', ENOTDIR = 'ENOTDIR', EISDIR = 'EISDIR', EBADF = 'EBADF';
const S_IFDIR = 0o040000, S_IFREG = 0o100000;
const files = new Map();     // path -> Uint8Array
const dirs = new Set(['/']);
const fds = new Map();       // fd -> {path, pos, flags}
let nextFd = 10, stdout = '';
const te = new TextEncoder(), td = new TextDecoder();

function err(code) { const e = new Error(code); e.code = code; return e; }
function norm(p) {
  const out = [];
  for (const s of p.split('/')) { if (s === '' || s === '.') continue; if (s === '..') out.pop(); else out.push(s); }
  return '/' + out.join('/');
}
function parent(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
function mkdirs(p) { for (let d = p; !dirs.has(d); d = parent(d)) dirs.add(d); }
function stats(p) {
  const isDir = dirs.has(p), f = files.get(p);
  if (!isDir && !f) return null;
  const now = Date.now();
  return { dev: 1, ino: 1, mode: isDir ? S_IFDIR | 0o755 : S_IFREG | 0o644, nlink: 1, uid: 0, gid: 0, rdev: 0,
    size: isDir ? 0 : f.length, blksize: 4096, blocks: 0, atimeMs: now, mtimeMs: now, ctimeMs: now,
    isDirectory: () => isDir };
}

const constants = { O_RDONLY: 0, O_WRONLY: 1, O_RDWR: 2, O_CREAT: 64, O_EXCL: 128, O_TRUNC: 512, O_APPEND: 1024, O_DIRECTORY: 65536, O_SYNC: 1052672 };
const fs = {
  constants,
  writeSync(fd, buf) {
    if (fd === 1 || fd === 2) { stdout += td.decode(buf); return buf.length; }
    return this._write(fd, buf, 0, buf.length, null);
  },
  _write(fd, buf, off, len, pos) {
    const h = fds.get(fd); if (!h) throw err(EBADF);
    let data = files.get(h.path) || new Uint8Array(0);
    const at = pos == null ? ((h.flags & constants.O_APPEND) ? data.length : h.pos) : pos;
    if (at + len > data.length) { const n = new Uint8Array(Math.max(at + len, data.length * 2 > at + len ? at + len : at + len)); n.set(data); data = n; }
    data.set(buf.subarray(off, off + len), at);
    files.set(h.path, data);
    if (pos == null) h.pos = at + len;
    return len;
  },
  write(fd, buf, off, len, pos, cb) {
    try {
      if (fd === 1 || fd === 2) { stdout += td.decode(buf.subarray(off, off + len)); return cb(null, len); }
      cb(null, this._write(fd, buf, off, len, pos));
    } catch (e) { cb(e); }
  },
  open(path, flags, mode, cb) {
    const p = norm(path);
    if (dirs.has(p)) { const fd = nextFd++; fds.set(fd, { path: p, pos: 0, flags, dir: true }); return cb(null, fd); }
    if (!files.has(p)) {
      if (!(flags & constants.O_CREAT)) return cb(err(ENOENT));
      if (!dirs.has(parent(p))) return cb(err(ENOENT));
      files.set(p, new Uint8Array(0));
    } else if ((flags & constants.O_CREAT) && (flags & constants.O_EXCL)) return cb(err(EEXIST));
    if (flags & constants.O_TRUNC) files.set(p, new Uint8Array(0));
    const fd = nextFd++;
    fds.set(fd, { path: p, pos: 0, flags });
    cb(null, fd);
  },
  close(fd, cb) { fds.delete(fd); cb(null); },
  read(fd, buf, off, len, pos, cb) {
    const h = fds.get(fd); if (!h) return cb(err(EBADF));
    if (h.dir) return cb(err(EISDIR));
    const data = files.get(h.path) || new Uint8Array(0);
    const at = pos == null ? h.pos : pos;
    const n = Math.max(0, Math.min(len, data.length - at));
    buf.set(data.subarray(at, at + n), off);
    if (pos == null) h.pos = at + n;
    cb(null, n);
  },
  fstat(fd, cb) { const h = fds.get(fd); if (!h) return cb(err(EBADF)); cb(null, stats(h.path)); },
  stat(path, cb) { const s = stats(norm(path)); s ? cb(null, s) : cb(err(ENOENT)); },
  lstat(path, cb) { this.stat(path, cb); },
  readdir(path, cb) {
    const p = norm(path);
    if (!dirs.has(p)) return cb(err(files.has(p) ? ENOTDIR : ENOENT));
    const pre = p === '/' ? '/' : p + '/', names = new Set();
    for (const k of files.keys()) if (k.startsWith(pre)) names.add(k.slice(pre.length).split('/')[0]);
    for (const k of dirs) if (k !== p && k.startsWith(pre)) names.add(k.slice(pre.length).split('/')[0]);
    cb(null, [...names]);
  },
  mkdir(path, perm, cb) { const p = norm(path); if (dirs.has(p) || files.has(p)) return cb(err(EEXIST)); if (!dirs.has(parent(p))) return cb(err(ENOENT)); dirs.add(p); cb(null); },
  rmdir(path, cb) { dirs.delete(norm(path)); cb(null); },
  unlink(path, cb) { const p = norm(path); if (!files.delete(p)) return cb(err(ENOENT)); cb(null); },
  rename(from, to, cb) { const a = norm(from), b = norm(to); if (!files.has(a)) return cb(err(ENOENT)); files.set(b, files.get(a)); files.delete(a); cb(null); },
  fsync(fd, cb) { cb(null); },
  ftruncate(fd, len, cb) { const h = fds.get(fd); if (!h) return cb(err(EBADF)); files.set(h.path, (files.get(h.path) || new Uint8Array(0)).slice(0, len)); cb(null); },
  truncate(path, len, cb) { const p = norm(path); files.set(p, (files.get(p) || new Uint8Array(0)).slice(0, len)); cb(null); },
  chmod(path, mode, cb) { cb(null); }, fchmod(fd, mode, cb) { cb(null); },
  chown(path, u, g, cb) { cb(null); }, fchown(fd, u, g, cb) { cb(null); }, lchown(path, u, g, cb) { cb(null); },
  utimes(path, a, m, cb) { cb(null); },
  readlink(path, cb) { cb(err('EINVAL')); },
  symlink(a, b, cb) { cb(err('ENOSYS')); }, link(a, b, cb) { cb(err('ENOSYS')); },
};
// Node calls fs callbacks later, never inside the call; Go's runtime relies on that (a callback
// that re-enters Go during its own call corrupts the scheduler), so every callback is deferred.
for (const k of Object.keys(fs)) {
  const f = fs[k];
  if (typeof f !== 'function' || k === 'writeSync' || k === '_write') continue;
  fs[k] = function (...args) {
    const cb = args.pop();
    f.call(fs, ...args, (...r) => queueMicrotask(() => cb(...r)));
  };
}
let cwd = '/';
const process = {
  getuid: () => -1, getgid: () => -1, geteuid: () => -1, getegid: () => -1, getgroups() { throw err('ENOSYS'); },
  pid: 1, ppid: 0, umask: () => 0o022,
  cwd: () => cwd, chdir(d) { cwd = norm(d); },
};
const path = {                  // (syscall.Open resolves every path it opens)
  resolve(...ps) {
    let r = cwd;
    for (const p of ps) r = p.startsWith('/') ? p : r + '/' + p;
    return norm(r);
  },
};
const encoder = te, decoder = td;
class Go {
  constructor() {
    this._exitPromise = new Promise((resolve) => {
      this._resolveExitPromise = resolve
    })
    this._pendingEvent = null
    this._scheduledTimeouts = new Map()
    this._nextCallbackTimeoutID = 1

    const setInt64 = (addr, v) => {
      this.mem.setUint32(addr + 0, v, true)
      this.mem.setUint32(addr + 4, Math.floor(v / 4294967296), true)
    }

    const getInt64 = (addr) => {
      const low = this.mem.getUint32(addr + 0, true)
      const high = this.mem.getInt32(addr + 4, true)
      return low + high * 4294967296
    }

    const loadValue = (addr) => {
      const f = this.mem.getFloat64(addr, true)
      if (f === 0) {
        return undefined
      }
      if (!isNaN(f)) {
        return f
      }

      const id = this.mem.getUint32(addr, true)
      return this._values[id]
    }

    const storeValue = (addr, v) => {
      const nanHead = 0x7ff80000

      if (typeof v === 'number' && v !== 0) {
        if (isNaN(v)) {
          this.mem.setUint32(addr + 4, nanHead, true)
          this.mem.setUint32(addr, 0, true)
          return
        }
        this.mem.setFloat64(addr, v, true)
        return
      }

      if (v === undefined) {
        this.mem.setFloat64(addr, 0, true)
        return
      }

      let id = this._ids.get(v)
      if (id === undefined) {
        id = this._idPool.pop()
        if (id === undefined) {
          id = this._values.length
        }
        this._values[id] = v
        this._goRefCounts[id] = 0
        this._ids.set(v, id)
      }
      this._goRefCounts[id]++
      let typeFlag = 0
      switch (typeof v) {
        case 'object':
          if (v !== null) {
            typeFlag = 1
          }
          break
        case 'string':
          typeFlag = 2
          break
        case 'symbol':
          typeFlag = 3
          break
        case 'function':
          typeFlag = 4
          break
      }
      this.mem.setUint32(addr + 4, nanHead | typeFlag, true)
      this.mem.setUint32(addr, id, true)
    }

    const loadSlice = (addr) => {
      const array = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      return new Uint8Array(this._inst.exports.mem.buffer, array, len)
    }

    const loadSliceOfValues = (addr) => {
      const array = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      const a = new Array(len)
      for (let i = 0; i < len; i++) {
        a[i] = loadValue(array + i * 8)
      }
      return a
    }

    const loadString = (addr) => {
      const saddr = getInt64(addr + 0)
      const len = getInt64(addr + 8)
      return decoder.decode(
        new DataView(this._inst.exports.mem.buffer, saddr, len),
      )
    }

    const testCallExport = (a, b) => {
      this._inst.exports.testExport0()
      return this._inst.exports.testExport(a, b)
    }

    const timeOrigin = Date.now() - performance.now()
    this.importObject = {
      _gotest: {
        add: (a, b) => a + b,
        callExport: testCallExport,
      },
      gojs: {
        // Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
        // may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
        // function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
        // This changes the SP, thus we have to update the SP used by the imported function.

        // func wasmExit(code int32)
        'runtime.wasmExit': (sp) => {
          sp >>>= 0
          const code = this.mem.getInt32(sp + 8, true)
          this.exited = true
          delete this._inst
          delete this._values
          delete this._goRefCounts
          delete this._ids
          delete this._idPool
          this.exit(code)
        },

        // func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
        'runtime.wasmWrite': (sp) => {
          sp >>>= 0
          const fd = getInt64(sp + 8)
          const p = getInt64(sp + 16)
          const n = this.mem.getInt32(sp + 24, true)
          fs.writeSync(fd, new Uint8Array(this._inst.exports.mem.buffer, p, n))
        },

        // func resetMemoryDataView()
        'runtime.resetMemoryDataView': (sp) => {
          sp >>>= 0
          this.mem = new DataView(this._inst.exports.mem.buffer)
        },

        // func nanotime1() int64
        'runtime.nanotime1': (sp) => {
          sp >>>= 0
          setInt64(sp + 8, (timeOrigin + performance.now()) * 1000000)
        },

        // func walltime() (sec int64, nsec int32)
        'runtime.walltime': (sp) => {
          sp >>>= 0
          const msec = new Date().getTime()
          setInt64(sp + 8, msec / 1000)
          this.mem.setInt32(sp + 16, (msec % 1000) * 1000000, true)
        },

        // func scheduleTimeoutEvent(delay int64) int32
        'runtime.scheduleTimeoutEvent': (sp) => {
          sp >>>= 0
          const id = this._nextCallbackTimeoutID
          this._nextCallbackTimeoutID++
          this._scheduledTimeouts.set(
            id,
            setTimeout(
              () => {
                this._resume()
                while (this._scheduledTimeouts.has(id)) {
                  // for some reason Go failed to register the timeout event, log and try again
                  // (temporary workaround for https://github.com/golang/go/issues/28975)
                  console.warn('scheduleTimeoutEvent: missed timeout event')
                  this._resume()
                }
              },
              getInt64(sp + 8),
            ),
          )
          this.mem.setInt32(sp + 16, id, true)
        },

        // func clearTimeoutEvent(id int32)
        'runtime.clearTimeoutEvent': (sp) => {
          sp >>>= 0
          const id = this.mem.getInt32(sp + 8, true)
          clearTimeout(this._scheduledTimeouts.get(id))
          this._scheduledTimeouts.delete(id)
        },

        // func getRandomData(r []byte)
        'runtime.getRandomData': (sp) => {
          sp >>>= 0
          crypto.getRandomValues(loadSlice(sp + 8))
        },

        // func finalizeRef(v ref)
        'syscall/js.finalizeRef': (sp) => {
          sp >>>= 0
          const id = this.mem.getUint32(sp + 8, true)
          this._goRefCounts[id]--
          if (this._goRefCounts[id] === 0) {
            const v = this._values[id]
            this._values[id] = null
            this._ids.delete(v)
            this._idPool.push(id)
          }
        },

        // func stringVal(value string) ref
        'syscall/js.stringVal': (sp) => {
          sp >>>= 0
          storeValue(sp + 24, loadString(sp + 8))
        },

        // func valueGet(v ref, p string) ref
        'syscall/js.valueGet': (sp) => {
          sp >>>= 0
          const result = Reflect.get(loadValue(sp + 8), loadString(sp + 16))
          sp = this._inst.exports.getsp() >>> 0 // see comment above
          storeValue(sp + 32, result)
        },

        // func valueSet(v ref, p string, x ref)
        'syscall/js.valueSet': (sp) => {
          sp >>>= 0
          Reflect.set(
            loadValue(sp + 8),
            loadString(sp + 16),
            loadValue(sp + 32),
          )
        },

        // func valueDelete(v ref, p string)
        'syscall/js.valueDelete': (sp) => {
          sp >>>= 0
          Reflect.deleteProperty(loadValue(sp + 8), loadString(sp + 16))
        },

        // func valueIndex(v ref, i int) ref
        'syscall/js.valueIndex': (sp) => {
          sp >>>= 0
          storeValue(sp + 24, Reflect.get(loadValue(sp + 8), getInt64(sp + 16)))
        },

        // valueSetIndex(v ref, i int, x ref)
        'syscall/js.valueSetIndex': (sp) => {
          sp >>>= 0
          Reflect.set(loadValue(sp + 8), getInt64(sp + 16), loadValue(sp + 24))
        },

        // func valueCall(v ref, m string, args []ref) (ref, bool)
        'syscall/js.valueCall': (sp) => {
          sp >>>= 0
          try {
            const v = loadValue(sp + 8)
            const m = Reflect.get(v, loadString(sp + 16))
            const args = loadSliceOfValues(sp + 32)
            const result = Reflect.apply(m, v, args)
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 56, result)
            this.mem.setUint8(sp + 64, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 56, err)
            this.mem.setUint8(sp + 64, 0)
          }
        },

        // func valueInvoke(v ref, args []ref) (ref, bool)
        'syscall/js.valueInvoke': (sp) => {
          sp >>>= 0
          try {
            const v = loadValue(sp + 8)
            const args = loadSliceOfValues(sp + 16)
            const result = Reflect.apply(v, undefined, args)
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 40, result)
            this.mem.setUint8(sp + 48, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 40, err)
            this.mem.setUint8(sp + 48, 0)
          }
        },

        // func valueNew(v ref, args []ref) (ref, bool)
        'syscall/js.valueNew': (sp) => {
          sp >>>= 0
          try {
            const v = loadValue(sp + 8)
            const args = loadSliceOfValues(sp + 16)
            const result = Reflect.construct(v, args)
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 40, result)
            this.mem.setUint8(sp + 48, 1)
          } catch (err) {
            sp = this._inst.exports.getsp() >>> 0 // see comment above
            storeValue(sp + 40, err)
            this.mem.setUint8(sp + 48, 0)
          }
        },

        // func valueLength(v ref) int
        'syscall/js.valueLength': (sp) => {
          sp >>>= 0
          setInt64(sp + 16, parseInt(loadValue(sp + 8).length))
        },

        // valuePrepareString(v ref) (ref, int)
        'syscall/js.valuePrepareString': (sp) => {
          sp >>>= 0
          const str = encoder.encode(String(loadValue(sp + 8)))
          storeValue(sp + 16, str)
          setInt64(sp + 24, str.length)
        },

        // valueLoadString(v ref, b []byte)
        'syscall/js.valueLoadString': (sp) => {
          sp >>>= 0
          const str = loadValue(sp + 8)
          loadSlice(sp + 16).set(str)
        },

        // func valueInstanceOf(v ref, t ref) bool
        'syscall/js.valueInstanceOf': (sp) => {
          sp >>>= 0
          this.mem.setUint8(
            sp + 24,
            loadValue(sp + 8) instanceof loadValue(sp + 16) ? 1 : 0,
          )
        },

        // func copyBytesToGo(dst []byte, src ref) (int, bool)
        'syscall/js.copyBytesToGo': (sp) => {
          sp >>>= 0
          const dst = loadSlice(sp + 8)
          const src = loadValue(sp + 32)
          if (
            !(src instanceof Uint8Array || src instanceof Uint8ClampedArray)
          ) {
            this.mem.setUint8(sp + 48, 0)
            return
          }
          const toCopy = src.subarray(0, dst.length)
          dst.set(toCopy)
          setInt64(sp + 40, toCopy.length)
          this.mem.setUint8(sp + 48, 1)
        },

        // func copyBytesToJS(dst ref, src []byte) (int, bool)
        'syscall/js.copyBytesToJS': (sp) => {
          sp >>>= 0
          const dst = loadValue(sp + 8)
          const src = loadSlice(sp + 16)
          if (
            !(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)
          ) {
            this.mem.setUint8(sp + 48, 0)
            return
          }
          const toCopy = src.subarray(0, dst.length)
          dst.set(toCopy)
          setInt64(sp + 40, toCopy.length)
          this.mem.setUint8(sp + 48, 1)
        },

        debug: (value) => {
          console.log(value)
        },
      },
    }
  }

  async run(instance) {
    if (!(instance instanceof WebAssembly.Instance)) {
      throw new Error('Go.run: WebAssembly.Instance expected')
    }
    this._inst = instance
    this.mem = new DataView(this._inst.exports.mem.buffer)
    this._values = [
      // JS values that Go currently has references to, indexed by reference id
      NaN,
      0,
      null,
      true,
      false,
      globalThis,
      this,
    ]
    this._goRefCounts = new Array(this._values.length).fill(Infinity) // number of references that Go has to a JS value, indexed by reference id
    this._ids = new Map([
      // mapping from JS values to reference ids
      [0, 1],
      [null, 2],
      [true, 3],
      [false, 4],
      [globalThis, 5],
      [this, 6],
    ])
    this._idPool = [] // unused ids that have been garbage collected
    this.exited = false // whether the Go program has exited

    // Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
    let offset = 4096

    const strPtr = (str) => {
      const ptr = offset
      const bytes = encoder.encode(str + '\0')
      new Uint8Array(this.mem.buffer, offset, bytes.length).set(bytes)
      offset += bytes.length
      if (offset % 8 !== 0) {
        offset += 8 - (offset % 8)
      }
      return ptr
    }

    const argc = this.argv.length

    const argvPtrs = []
    this.argv.forEach((arg) => {
      argvPtrs.push(strPtr(arg))
    })
    argvPtrs.push(0)

    const keys = Object.keys(this.env).sort()
    keys.forEach((key) => {
      argvPtrs.push(strPtr(`${key}=${this.env[key]}`))
    })
    argvPtrs.push(0)

    const argv = offset
    argvPtrs.forEach((ptr) => {
      this.mem.setUint32(offset, ptr, true)
      this.mem.setUint32(offset + 4, 0, true)
      offset += 8
    })

    // The linker guarantees global data starts from at least wasmMinDataAddr.
    // Keep in sync with cmd/link/internal/ld/data.go:wasmMinDataAddr.
    const wasmMinDataAddr = 4096 + 8192
    if (offset >= wasmMinDataAddr) {
      throw new Error(
        'total length of command line and environment variables exceeds limit',
      )
    }

    this._inst.exports.run(argc, argv)
    if (this.exited) {
      this._resolveExitPromise()
    }
    await this._exitPromise
  }

  _resume() {
    if (this.exited) {
      throw new Error('Go program has already exited')
    }
    this._inst.exports.resume()
    if (this.exited) {
      this._resolveExitPromise()
    }
  }

  _makeFuncWrapper(id) {
    const go = this
    return function () {
      const event = { id: id, this: this, args: arguments }
      go._pendingEvent = event
      go._resume()
      return event.result
    }
  }
}

// Runs tsgo once on a fresh in-memory project; resolves when it exits.
globalThis.runTsgo = async function (module, list, opt) {
  files.clear(); dirs.clear(); dirs.add('/'); fds.clear(); stdout = ''; cwd = '/proj';
  for (const f of list) { const p = norm('/proj/' + f.path); mkdirs(parent(p)); files.set(p, te.encode(f.src)); }
  const config = { compilerOptions: {
    target: 'es2023', module: opt.esm ? 'esnext' : 'commonjs', experimentalDecorators: true, emitDecoratorMetadata: true,
    useDefineForClassFields: !!opt.define, jsx: 'react-jsx', removeComments: true, outDir: '/out',
    rootDir: '/proj', noCheck: true, skipLibCheck: true, types: [], noResolve: true,
  }, include: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'] };
  mkdirs('/proj'); mkdirs('/out'); mkdirs('/tmp');
  files.set('/proj/tsconfig.json', te.encode(JSON.stringify(config)));
  // Go's runtime finds fs, process and path as globals; they're there only while tsgo runs, so
  // tsc and swc in the same worker never take this for Node
  const saved = { fs: globalThis.fs, process: globalThis.process, path: globalThis.path };
  Object.assign(globalThis, { fs, process, path });
  const go = new Go();
  go.argv = ['tsgo', '-p', '/proj/tsconfig.json'];
  go.env = { TMPDIR: '/tmp', HOME: '/tmp' };
  let code = null;
  const done = new Promise((res) => { go.exit = (c) => { code = c; res(); }; });
  const inst = await WebAssembly.instantiate(module, go.importObject);
  const t0 = performance.now();
  go.run(inst);
  await done;
  const ms = performance.now() - t0;
  for (const k in saved) { if (saved[k] === undefined) delete globalThis[k]; else globalThis[k] = saved[k]; }
  const outputs = {};
  for (const [k, v] of files) if (k.startsWith('/out/')) outputs[k.slice(5)] = td.decode(v);
  return { ms, exitCode: code, outputs, stdout };
};
})();
