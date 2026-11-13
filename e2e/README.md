# End-to-end tests

These tests load the built extension into a real VS Code and drive it with Playwright.
There are two suites, and neither is part of `pnpm build` or CI.

```bash
pnpm build:js        # the tests load dist/, so rebuild first
pnpm test:links      # focused host-handler regression tests, no browser required
pnpm test:e2e:web
pnpm test:e2e:desktop
```

Each suite prints `PASS`/`FAIL` lines and exits non-zero if any check fails.
They copy `e2e/fixture` to a temp folder, so nothing is written into the repo.

The focused `test:links` checks load the built extension with VS Code API stubs.
They cover heading-symbol prefixes and shapes, Unicode and duplicate anchors,
encoded paths, plain links, missing headings, and the existing path restrictions.
They do not replace the real VS Code suites below.

## Requirements

- Google Chrome (the web suite launches it with Playwright's `channel: 'chrome'`).
- Desktop suite: VS Code, at the default macOS path or set by `VSCODE_PATH`.
- Web suite: the first run downloads VS Code for the Web (about 80 MB) into `.vscode-test-web/`, which is git-ignored.
- Set `E2E_VSCODE_COMMIT` to a VS Code commit to reuse a cached build without checking for the latest release.
- Ports `3123` (web, `E2E_PORT`) and `9333` (desktop, `E2E_CDP_PORT`) must be free.

## What is covered

Web (`web.mjs`, VS Code for the Web through `@vscode/test-web`):

- The webview loads, the legacy-option warning shows, and frontmatter themes apply.
- The toolbar has Export and Edit, and local images are rewritten to webview URIs and load.
- Cursor to map: the node flashes, "Toggle the active node" folds it, and a cursor inside a folded branch unfolds it.
- Map to cursor: double-clicking a node jumps to its source line.
- A relative link on a node opens the file.
- Cross-file anchors select the source heading, including Unicode, encoded fragments, and duplicate headings.
- Typing updates the map live, and the map follows the VS Code color theme.
- An anchor link in a note popover flashes the heading.
- The export picker lists SVG, PNG and HTML, and each opens a save dialog.
  The web file system is in-memory, so the written files are not checked here.

Desktop (`desktop.mjs`, desktop VS Code over the DevTools protocol):

- The webview loads, images are rewritten, and math renders.
- A code block in a note is highlighted, which proves the lazy chunk loads.
- Cross-file anchors select the source heading, including Unicode, encoded fragments, and duplicate headings. Each case resets the source cursor first to avoid stale-position passes.
- SVG, PNG and HTML exports write real, valid files.

Both suites also fail on console errors, except `favicon` and `404`.

## Not covered

- Relative links inside a note popover (the label-link route is covered).
- Clicking an external `https` link. It opens a page outside VS Code, which the tests cannot verify.
- Windows and Linux. The helpers are platform-neutral, but only macOS has been run.

## Maintenance notes

- The tests drive VS Code's own UI (command palette, quick-input save dialog), so a VS Code update can break selectors.
- `files.simpleDialog.enable` makes the desktop save dialog a quick-input box that Playwright can type into.
- Node IDs in the map are hashes, so tests look nodes up by their text with `findNodeId`.
- Line numbers in `fixture/sample.md` are used by the tests (lines 13, 14, 21, 23 and 24). Update both together.
