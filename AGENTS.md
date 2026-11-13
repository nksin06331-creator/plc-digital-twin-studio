# Development instructions

- Use the existing checkout in this isolated cloud environment. Do not create worktrees unless explicitly requested.
- Node.js 24 and npm; install using `npm ci` (if the home npm cache is unavailable, use `--cache /tmp/plc-npm-cache`).
- Required checks: `npm run build`, `npm run test`, `npm run lint`.
- Keep `src/core` independent of React, DOM, rendering and transport. A future 3D scene consumes memory snapshots; it must not implement PLC logic.
- Do not claim GX Works2 compatibility without representative, sanitized CSV fixtures and documented schema validation. Samples use a separate demonstration adapter.
- Unsupported instructions and ambiguous block semantics must block simulation before memory mutation. Never treat them as NOP.
- Never upload user CSV or include business data in samples, logs, test artifacts or Pages builds.
