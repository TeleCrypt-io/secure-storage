# TeleCrypt.io Storage — web UI

A React + Vite + TypeScript app that is a **thin adapter over `../src/core/`** — it builds a
browser session, calls `core.*` directly, and renders the typed results. No E2EE/sharing/
recovery logic lives here; see `../docs/UI_SPEC.md` for the full spec and `../STATUS.md` (Phase
9) for what was built and how it was verified.

## Run it

```
npm install                  # first time only
npm run synapse:up --prefix ..  # or: cd .. && npm run synapse:up
npm run dev                  # http://localhost:5173
```

## Test it

```
npm test        # Vitest + React Testing Library, jsdom, core/ mocked at the boundary
npm run e2e      # Playwright, real disposable Synapse, zero mocks — starts Vite + Synapse itself
```

## Build / lint

```
npm run build    # tsc -b && vite build
npm run lint     # oxlint
```
