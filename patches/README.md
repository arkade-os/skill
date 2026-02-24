# Patches

## @lendasat/lendaswap-sdk-pure@0.2.1

The published package has missing `.js` extensions on some ESM imports (`./create`, `./evm`, `./refund`, `./storage`, `./price-calculations`, `../evm`), which breaks Node.js ESM module resolution. This patch adds the `.js` extensions to the affected import paths in `client.js`, `index.js`, `redeem/gasless.js`, `create/arkade.js`, and `create/lightning.js`.

Applied automatically via pnpm's `patchedDependencies` in `pnpm-workspace.yaml`.

Remove this patch once the upstream package ships a fix.
