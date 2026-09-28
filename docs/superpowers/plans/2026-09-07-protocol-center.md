# Protocol Center Implementation Plan

Goal: Make platform connection protocols, model execution protocols and configuration diagnostics visible and reusable in AI OS.

User authorized adding useful DX protocol-center behavior and repeatedly confirmed continuation after the design was explained. Existing implementation changes and credentials must be preserved. No Git mutation or paid upstream requests are required.

Design: Builtin platform/model entries reference actual runtime definitions. Custom entries inherit one builtin runtime and may restrict model capabilities; they cannot invent HTTP templates. Store them in the existing SQLite system settings, include them in saved-provider inference and runtime resolution, and protect referenced entries from destructive edits/deletion. Route checks use the same resolver and execution description as real requests without sending upstream traffic. Settings display the two scopes, custom CRUD and route diagnostics using existing themes.

- [x] Replace initial standalone prototype with shared runtime contracts and tests covering aliases, scope, capability restrictions, persistence and delete-in-use.
- [x] Integrate registry/store/engine with custom protocol resolution; reject invalid custom scope and unsupported execution before a request is submitted.
- [x] Add authenticated admin HTTP catalog, CRUD and readonly route-check APIs using the actual resolver.
- [x] Implement protocol-center UI and separate platform/model selectors. Independent UI work follows the agreed HTTP contract.
- [x] Verify isolated HTTP/browser flows, protocol execution contracts, provider/APIMart regressions and portable runtime inclusion.
- [x] Restart the verified idle AI OS instance, check current source/health and document scope and use.

Validation commands: `node --disable-warning=ExperimentalWarning tools/check-protocol-center.js`, `node --disable-warning=ExperimentalWarning tools/check-protocol-center-browser.js`, `npm run check:providers`, `npm run check:provider-compatibility`, `npm run check:apimart-reliability`, `npm run check:portable-runtime`.

Completed: backend tests and independent review passed, Chrome full lifecycle and 620/390 px layout checks passed. Initial runtime restart was rejected because approval service hit usage limits; after user continuation and fresh read-only identity/idle verification, restart succeeded (41948 → 46360). Post-restart health and four served frontend files verified against current source. Evidence: `artifacts/protocol-center/runtime-verification.json`; usage guide: `docs/协议中心使用说明.md`.
