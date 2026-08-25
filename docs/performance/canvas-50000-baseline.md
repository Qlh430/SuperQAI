# 50,000-Node Canvas Performance Baseline

Date: 2026-08-25 (Asia/Shanghai)  
Implementation revision: `1d2926b` (`codex/canvas-grid-editor`)  
Fixture seed: `50000`

## Baseline machine

- Windows 10.0.19045 x64
- Intel Core i7-10700 @ 2.90 GHz, 16 logical CPUs
- 31.91 GB RAM
- Node.js 24.13.0
- Google Chrome 151.0.7922.174, headless, 1440 × 900 viewport

## Fixture

- 50,000 nodes: 15,000 text/basic, 15,000 image, 10,000 generation/form, 5,000 audio/video, and 5,000 group/Agent/workflow
- 100,000 valid connections
- 25,000 media references
- Dense, overlapping, sparse, and ordinary detail regions
- Coordinates include exactly `-1,000,000,000` and `1,000,000,000`
- Generated through repository batches with SQLite R*Tree and 12 materialized LOD levels in 183,699 ms

## Browser and server acceptance

| Metric | Result | Gate | Status |
|---|---:|---:|---|
| Cold usable | 258 ms | ≤ 2,000 ms | Pass |
| Warm usable | 181 ms | ≤ 1,000 ms | Pass |
| Viewport query P95 | 9.98 ms | ≤ 75 ms | Pass |
| Viewport query P99 | 99.51 ms | recorded | — |
| Pan/zoom frame P95 | 16.8 ms | ≤ 20 ms | Pass |
| Pan/zoom frame P99 | 16.8 ms | ≤ 50 ms | Pass |
| Input response P95 | 0.2 ms | recorded | — |
| Longest interaction task | 0 ms | ≤ 100 ms | Pass |
| Detailed mounted nodes | 36 | ≤ 800 | Pass |
| Total canvas DOM elements | 395 | ≤ 1,200 | Pass |
| Browser JS heap | 14.54 MB | ≤ 350 MB | Pass |
| Server RSS | 108.78 MB | ≤ 250 MB | Pass |
| Text visible | 0.1 ms | ≤ 300 ms | Pass |
| Thumbnail visible | 0.1 ms | ≤ 800 ms | Pass |
| Blank nodes | 0 | 0 | Pass |
| Browser/page errors | 0 | 0 | Pass |

The original query path measured 221–231 ms P95 because SQLite selected the board indexes first and repeatedly probed the R*Tree. The final query uses R*Tree-first execution plans and removes the connection sort from the bounded viewport result.

## Ten-minute stability run

- Duration: 600,813 ms
- Viewport/interaction iterations: 2,284
- Incremental node mutations: 39, each followed by an idempotent duplicate retry
- Query P95/P99: 7.58/7.95 ms
- Maximum query: 29.68 ms
- Stable-window RSS: 75.69 MB → 81.56 MB
- Memory growth: 7.75% (gate: ≤ 15%)
- Final counts: 50,000 nodes and 100,000 connections
- Blank/malformed returned nodes: 0
- SQLite `quick_check`: `ok`

## Recovery and legacy compatibility

Crash checks terminate the database Worker after SQL but before commit for normal operation batches, migration setup, and import batches. Reopen verified full rollback, no uncommitted operation IDs, exactly-once retry, hidden inactive migration state, unchanged backup bytes, and `quick_check=ok`.

The existing 47-board legacy file was tested through a byte-identical temporary copy. Its SHA-256 was `a0bbb451abf52337f5d99b2a64953727c5b345081bc485ca47275848e606b839`. Chrome successfully opened:

- the largest active historical canvas (186 nodes, 157 connections) through LOD;
- a mixed historical canvas (53 nodes, 37 connections, including image, gallery, text, LLM, Comfy, video, audio, and MiniMax nodes), with 12 mounted nodes and 11 mounted image nodes;
- an early historical canvas (5 nodes, 2 connections), with all 5 nodes and 2 images mounted.

For each board, the active ID/title, viewport, node count, and connection count matched the source. The original and copied legacy hashes remained unchanged.

## Guarantee boundary and cleanup

The supported guarantee is 50,000 mixed nodes, 100,000 connections, and 25,000 media references on this baseline. Storage and paging have no fixed entity-count ceiling; canvases beyond the guarantee continue in best-effort mode using the same bounded viewport, DOM, media, and memory budgets rather than switching back to full-board hydration.

Pressure data was isolated under ignored `tmp/canvas-pressure/`. The 50,000-node database, browser copies, crash databases, and migrated old-canvas copies were closed and deleted after verification; cleanup assertions confirmed the paths no longer existed.
