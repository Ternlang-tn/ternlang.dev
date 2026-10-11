---
name: tern
description: Write, check, test, and ship programs in Tern, a compiled Python-like language (.tn files, tern.mod). Use whenever you read or write .tn files, the user asks for something built in Tern, or a directory has a tern.mod — Tern is not Python, so load this before writing any Tern code.
---

# Writing Tern

Tern looks like Python but is statically typed, compiled to native code, and has no
references: every value is a copy. You have not seen much Tern, so **don't write it from
memory of Python**. Read the rules, then let the compiler correct you.

## Before the first line of code

```sh
tern version              # prints ROOT: where the docs and library live
tern guide short          # the rules that differ from Python (read all of it, ~70 lines)
tern guide <topic>        # one section: strings, maps, arrays, structs, enums, closures, parallel ...
tern guide <module>       # a library's API: web, json, sqlite, os, fs, task, auth, ...
```

`tern guide NAME` prints a library's API (`tern guide web`, `tern guide json`): read it before
calling a module; don't guess function names. A package fetched into `deps/NAME/` documents
itself the same way, at the top of `deps/NAME/NAME.tn`. `ROOT/docs/reference.md` is the whole
language on one page; `ROOT/llms-full.txt` is the reference plus every library's source.

## The loop

```sh
tern check --json app.tn     # {"ok": false, "errors": [{"file","line","message","hint","source"}]}
tern run app.tn [-- args]    # compile and run (runtime errors exit with status 2)
tern test                    # every test_* function in *_test.tn files below here
tern fmt                     # the standard layout
tern build app.tn -o app     # one static-ish binary; --target linux / linux-static / wasm ...
```

Fix every error `check` reports (they come all at once) and follow each `hint`; it usually
says exactly what to write. Check after every few functions, not at the end.

## Starting a project

`tern new NAME --template web|cli|lib` writes a working project (with tests, an
AGENTS.md, and for web a JSON API with accounts on SQLite, migrations, and a page). Start from it rather than
from an empty file, and keep its layout: `main.tn` wires things up, the code lives in a
module directory next to it (every `.tn` file in a directory is one module, imported by
the directory's name), tests are `*_test.tn`.

## Rules that trip up models (the full list is `tern guide short`)

- `fn f(a: int, b: str) int:`; every parameter typed; no return type = returns nothing.
- `x = 5` declares; the type is fixed. No globals, no classes, no `None`/null, no exceptions,
  no tuples-as-records. Use `struct`, `enum` + `match`, `Option[T]`, `Result[T, E]` with `?`.
- `true`/`false`, `and`/`or`/`not`, double-quoted strings, `f"n={n}"`.
- No implicit int/float mixing: `float(n) * 1.5`. `str + int` is an error: `"n=" + str(n)`.
- `for i in 0..n:` (no `range`), `for i, x in xs:` for index and value.
- Arrays: `xs.push(v)`, `xs.pop()`, `len(xs)`; `xs.sorted()`, `xs.map(...)`, `xs.filter(...)`
  return new arrays. No `append`, comprehensions, or negative indexes.
- Parameters are read-only. To change the caller's value: `fn inc(n: mut int)`, called `inc(&x)`.
- Structs have no methods inside; `fn area(r: Rect) float` makes `r.area()` work.
- Assignment copies (cheaply, copy-on-write): `b = a` then changing `b` never changes `a`.
  State shared across requests or tasks is a `task.shared(value)` updated with a function.
- Tasks: `task.spawn(fn() f(x))` + `h.join()`; a group that fails fast (Go's errgroup):
  `task.try_all(fs)` / `task.try_all_limit(fs, n)`; plain fan-out: `task.all(fs)`.
- A counter or cache every request touches: `task.atomic(0)` (`a.add(1)`, `a.load()`) and
  `task.shared_map()` (`m.get_or(k, "")`, `m.put(k, v)`, `m.add_int(k, 1)`), not `task.shared`
  (whose lock makes every access take turns).
- Data races are compile errors, not runtime bugs; if the checker refuses a parallel
  block, restructure rather than fight it.

## Libraries

Standard library (`import NAME`): fs, os, json, fmt, math, random, time, re, log, testing,
task (async tasks, channels, shared state), net, http (server + client), tls, crypto
(hashes, HMAC, password hashing, random bytes), compress (zstd, gzip, zlib, deflate), html, csv, path (join, clean, ext, rel, glob), flag (command-line flags into a struct), url (parse, resolve, query pairs, escaping), toml (config files into a struct), binary (endian ints, varints, Writer / Reader), heap, pqueue, deque, bitset, term (colors, tables, progress).

First-party packages (also just `import NAME`, nothing to install): sqlite, web (router,
middleware, WebSockets, SSE, static files, validation, HTTP client), pg (PostgreSQL), redis,
auth (JWT, signed-cookie sessions), migrate (schema migrations; `tern migrate`), sqlgen
(typed functions from SQL; `tern sqlgen`), openapi, queue, sentry.

Anything else: `tern search WORD` looks in the package index, `tern add NAME` adds one to
`tern.mod` and fetches it into `deps/` (`tern get NAME git-url@version` for a package that
isn't indexed). For an HTTP API that publishes an OpenAPI spec (Stripe, GitHub, Slack...),
`tern openapi-client spec.json -o . --name stripe --tag customers` writes a typed client
module. Otherwise write a small module over `roost`'s HTTP client and `json` rather than
reaching for another language.

## Conventions for apps

- Configuration from the environment (`os.env("PORT", "8080")`), with defaults that work locally.
- SQLite (`sqlite`) unless the user asks for PostgreSQL; the schema in `migrations/NNNN_name.sql`
  applied at startup with `migrate`; queries through `sqlgen` when there are more than a few.
- A write on a hot path that may be lost in a crash (click / view counters, last-seen times):
  `d.exec_later(sql, params)` returns at once and commits within ~50 ms; `d.flush()` before a
  read that must see it. Everything else (signups, orders): `d.exec`, saved before it returns.
- Request bodies: decode into a struct with `req.json(&body)`; a field the client may leave
  out is an `Option[T]` (start it at `None`: a missing key stays `None`, `""` is `Some("")`).
- Handlers are `fn(roost.Request) roost.Response`; test them by calling them directly with a
  built request (no server, no port) — see the template's tests.
- Secrets never in code: `os.env("APP_SECRET", "")`, refusing to start in production without one.
- Ship with `tern build main.tn -o app` (or `--target linux-static` for a container).

## When stuck

Search `ROOT/docs/errors.md` for the error text; `ROOT/docs/guides/coming-from.md` maps
Python/Go/Rust/JS constructs to Tern; `ROOT/docs/guides/cookbook.md` and
`ROOT/docs/guides/web-apps.md` have tested recipes. If the compiler seems wrong, make the
smallest program that shows it and tell the user rather than working around it silently.
