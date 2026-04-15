# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Accessibility Scanner

A full-stack web accessibility scanner targeting Siteimprove accuracy.

### Architecture
- **Frontend**: React + Vite (`artifacts/accessibility-scanner`) on port 8081 (external: 80)
- **Backend**: Express 5 (`artifacts/api-server`) on port 8080
- **Scanner**: `src/lib/scanner.ts` — Puppeteer + `puppeteer-extra-plugin-stealth` + system Chromium
- **Queue**: `src/lib/scanQueue.ts` — concurrent scan processing with real-time SSE progress

### Cloudflare Bypass
- `puppeteer-extra` + stealth plugin + persistent Chrome profile at `.chrome-profile/`
- Detects challenge page ("just a moment" / "verifying your connection") and waits up to 25s
- Both `puppeteer-extra` and `puppeteer-extra-plugin-stealth` are in `build.mjs` externals (fixes `kind-of` CJS error)

### Accuracy Status (keysightcare page vs Siteimprove)
| Rule | Our count | Siteimprove | Notes |
|------|-----------|-------------|-------|
| SIA-R14 | 29 | 29 | ✅ Exact (label-in-name) |
| SIA-R114 | 4 | 4 | ✅ Exact |
| SIA-R36 | 1 | 2 | -1 |
| SIA-R32 | 50 | 45 | +5 |
| SIA-R30 | 19 | 51 | -32 (under-reporting) |
| SIA-R31 | 24 | 46 | -22 (under-reporting) |
| SIA-R35 | 156 | 99 | +57 (over-reporting) |

### Key Rule Fixes Made
- **SIA-R3**: Only flag duplicate IDs referenced via aria-labelledby/describedby/label[for]/anchors
- **SIA-R14 (v2)**: Use `el.innerText` (browser-rendered, excludes sr-only) for visible text; deduplicate AEM double-render pattern ("Awards Awards" → "Awards"); placeholder fallback for inputs; `getAccessibleName()` for aria-labelledby/aria-label
- **SIA-R22**: Skip muted, VideoJS-managed, autoplay+loop+playsinline background videos
- **SIA-R33**: Removed (false positive)
- **SIA-R36**: Deduplicate by (element-type, attribute) pair; only report each unique case once
- **SIA-R58**: Match skip link by text keywords (skip/main content/jump to), not just "first link is an anchor"
- **SIA-R65**: Only flag if outline removed AND no visual replacement (box-shadow/border/etc.)
- **SIA-R68**: Text clipping — fixed height + overflow:hidden where scrollHeight > clientHeight; skip sr-only elements
- **SIA-R87**: Expanded main landmark check with AEM-common selectors + skip-link anchor heuristic
- **SIA-R30/R31**: Now scan text-leaf nodes (elements with direct TEXT_NODE children), including AEM divs

### Concurrency Fix
- Global mutex (`_scanMutex`) serializes all `scanPage()` calls — the persistent Chrome profile cannot be opened by two Chromium processes simultaneously; previously concurrent scans crashed the second one
