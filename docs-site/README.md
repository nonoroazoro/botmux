# Botmux documentation

The English and Chinese documentation is built with Rspress.

## Local development

Run these commands from `docs-site`:

```bash
pnpm install
pnpm dev
```

## Build and preview

```bash
pnpm build
pnpm preview
```

The static output is written to `doc_build/`. Set `BOTMUX_DOCS_BASE` and
`BOTMUX_DOCS_ASSET_PREFIX` for the intended hosting path.

Edit pages in `docs/en/` and `docs/zh/`, and update navigation in
`rspress.config.ts`. Use `.mdx` for pages containing JSX or video elements.
