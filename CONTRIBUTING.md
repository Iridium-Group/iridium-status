# Contributing

Thanks for helping. Please read the organization-wide guide first:
https://github.com/Iridium-Group/.github/blob/main/CONTRIBUTING.md

## This repository

Requires Node.js 22.18 or newer and npm.

```sh
npm ci                 # install
npm test               # run the test suite
npm run typecheck      # TypeScript, including tests
npm run format         # format with Prettier
npm run format:check   # what CI runs
npm run build          # render dist/index.html
```

- Keep the project free of runtime dependencies. Source runs directly on Node with type stripping,
  so use only erasable TypeScript syntax (no enums or parameter properties).
- Add tests for every behavior change. Network tests must only use servers started on 127.0.0.1
  by the test itself (see `test/fixtures/`).
- To monitor a new service, add it to `services.json`; the README lists the fields.
- Do not edit `data/` by hand. The scheduled workflow owns it.
- `site/tokens.css` and `site/base.css` are copied verbatim from the `iridium` repository's `ui/`
  folder. Update them there first, then copy them here.
- Use Conventional Commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`, `ci:`, `refactor:`).
