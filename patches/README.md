# Patches

## @lendasat/lendaswap-sdk-pure@0.0.2

The published package has missing `.js` extensions on some ESM imports (`./storage`, `./price-calculations`, `./price-feed`, `./usd-price`), which breaks Node.js ESM module resolution. This patch adds the `.js` extensions to the affected import paths.

Applied automatically via pnpm's `patchedDependencies` in `pnpm-workspace.yaml`.

Remove this patch once the upstream package ships a fix.
