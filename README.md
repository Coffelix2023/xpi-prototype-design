# xpi-prototype-design

**English** · [简体中文](./README.zh-CN.md)

**[Pi-Extension] One-Commander turns design discussions into versioned, reviewable prototype artifacts.**
**PI扩炸: 一个斜杠命令把设计讨论落成可版本化、可评审的原型产物。**

<!-- TODO: add a LICENSE file (MIT) — the badge below links to it -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

```text
> /xpi-prototype-design
```

## Why

While the design conversation is in the chat it is fine; the moment it ends, nobody can tell which revision was approved. A wireframe gets signed off, the high-fidelity pass quietly drops a CTA, and the only record is scrollback. This extension keeps the loop on disk, inside the project, and versioned: a product map holds stable page ids, structured discovery rounds land in a page's `plan.md`, output goes into its `current/` working copy, and every round is snapshotted to `vN/` with a rollback command recorded in one reverse-chronological `CHANGELOG.md`. Theme tokens come from a `THEMES.md` that the extension scaffolds once and never overwrites.

Every extension in this repository starts from the same four rules:

- **No build step.** Pi loads `./src/index.ts` directly. No `dist/`, no bundler, no committed artifacts.
- **Pi-native UI.** Rendering goes through `ctx.ui.*` and `@earendil-works/pi-tui`. It never hijacks the terminal or pulls in a competing terminal framework.
- **No heavy runtime dependencies.** Host-provided APIs plus strict types; `typebox` for tool schemas, and nothing else unless it earns its place.
- **Strict gates, no exceptions.** TypeScript strict, Biome, and Vitest must all pass before any commit.

It also stays inside its lane: an extension is a plugin loaded into the Pi main process, not a separate service. If a task needs a process boundary, say so in an ADR before adding one.

## Tech stack

- [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/), versions pinned in [`mise.toml`](./mise.toml)
- [Pi Coding Agent](https://github.com/earendil-works/pi) — the host, its extension API, and `@earendil-works/pi-tui`
- TypeScript strict (`target: ES2024`, `module: NodeNext`)
- [Biome](https://biomejs.dev/) for lint and format
- [Vitest](https://vitest.dev/) as the test runner

## Install

Requires a working Pi installation. The package is loaded straight from source, so there is nothing to build first.

```bash
pi install git:github.com/Coffelix2023/xpi-prototype-design
```

`pi install` writes to `~/.pi/agent/settings.json`; `-l` writes to the project settings, which Pi installs automatically once the project is trusted. A pinned git ref is not moved by `pi update`.

```bash
pi list                              # installed packages
pi update --extensions               # update packages and reconcile pinned refs
pi remove git:github.com/<owner>/xpi-prototype-design
```

Package-level debugging uses npm or git remote sources on purpose: a local-path install only records a reference to your working copy and leaves a stale entry in settings the moment you forget to `pi remove` it.

## Usage

| Command | Description |
| --- | --- |
| `/xpi-prototype-design [<requirement>]` | The single entry point: starts the orchestration Skill, which walks goal → product → page scope → action → fidelity → scope summary → gate |
| `/xpi-prototype-design help` | Print the usage table (same output as the bare command) |
| `/xpi-prototype-design wireframe <requirement>` | Internal mode, kept for compatibility: start a wireframe directly |
| `/xpi-prototype-design hifi [<requirement>]` | Internal mode: build on an existing wireframe, or go from scratch |
| `/xpi-prototype-design execute` | Internal mode: pick a saved `tasks.md` and continue from its first unfinished task |
| `/xpi-prototype-design update` | Internal mode: revise an existing project — the command layer then asks how big this round is (edit directly / show the change list first) |
| `/xpi-prototype-design archive` | Internal mode: pick a finished project to archive |

Only the bare entry is user-facing. The modes above are an internal compatibility layer: the guided flow never asks you to type `wireframe`, `hifi`, `execute`, `update`, `archive` or any `--*` flag. Migrating legacy assets is one of the goals the orchestrator offers, and it hands off to the `xpi-prototype-migration` Skill instead of the design flow.

Argument completion is fuzzy, so a first letter is enough (`w` → `wireframe`). Typing the command with a trailing space lists all six internal modes and Tab picks one — there is no mode menu, and Enter prints the usage table.

### The unified entry

The bare command starts the orchestration Skill, which asks one structured question per step and never makes you type an internal mode or a `--*` flag:

1. **Goal** — create, continue, advance, review, archive, or migrate an existing prototype.
2. **Product** — read `prototype_status` and pick or confirm the product project; the product map is the source of truth for page identity.
3. **Page scope** (optional) — pick one or more page ids, shown with their name, implementation, fidelity, route and directly affected pages. Unregistered pages cannot become write targets; a single-page product or a legacy project-level stage skips this step.
4. **Action** — read, create, revise, advance, preview, or roll back.
5. **Fidelity transition** — state the current and target `none` / `wireframe` / `prototype` / `hifi`. Changing fidelity never changes a page id or a declared link.
6. **Scope summary** — current state, planned changes, affected pages and exclusions. A shared-navigation or link-contract change must confirm the complete affected set.
7. **Gate** — cancelling writes nothing; save / execute / supplement / resume follow the rules below, and every write is bound to the confirmed page scope.

Choosing "migrate" at step 1 hands off to the migration Skill instead — see [Migration](#migration).

### Product and page model

A product project is the container; a **page** is the thing you actually operate on. Each product keeps a product map at `<cwd>/.pi/prototype-design/<product>/product-map.json`.

| Dimension | Values |
| --- | --- |
| `implementation` | `production` / `prototype` / `external` / `placeholder` |
| `fidelity` | `none` / `wireframe` / `prototype` / `hifi` |

- Every page carries a stable `id` (lowercase kebab-case), a display name, an optional production `route`, the prototype entry file, and declared links. Links address other pages by that stable `id`, so advancing a page from wireframe to hifi breaks nothing.
- Maturity is **mixed by design**: production, wireframe, hifi, external and placeholder pages coexist in one map. A stage directory no longer stands for the whole product.
- Page artifacts live under `<product>/pages/<page-id>/<kind>/` with the same `plan.md` / `tasks.md` / `gate.json` / `current/` / `vN/` layout as a project-level stage. Planning, gates, snapshots, changelog entries and rollback targets are scoped to one page; a single-page operation cannot silently authorize its siblings.
- Preview resolves through a page id (or a product-flow entry). A multi-page product never falls back to "first HTML by file name".
- Changing shared navigation or a link contract must list every affected page up front: `prototype_page_impact` computes that set and reports an incomplete scope instead of guessing.

| Operation | Scope |
| --- | --- |
| `plan.md` / `tasks.md` | one page stage |
| `prototype_gate` + `gate.json` | one page stage, or a project-level stage while no product map exists |
| `prototype_snapshot` + `vN/` + `CHANGELOG.md` + rollback | one page stage |
| `prototype_preview` | one page — a multi-page product requires `pageId` or `flow` |
| shared navigation / link-contract change | every page in `prototype_page_impact`'s affected set |

### Legacy stage-based artifacts

Existing stage-based artifacts (`<project>/<kind>/`) stay readable: `prototype_status` still reports them, historical `vN/` snapshots are untouched, and nothing is migrated or deleted automatically. Migration is the only path that moves legacy assets, and it is read-only on the source.

### Progressive by design: a planning leg and an execution leg

A prototype is not "answer the questions and start drawing". The order is rigid, and it mirrors `xpi-fast-fix`: **show it in chat, ask, and only then write to disk**.

1. When discovery (3 rounds × 3 questions) ends, the agent shows the full `plan.md` content and the `tasks.md` list in chat — that step sends a message and writes nothing;
2. It calls `prototype_gate`, and the **extension** — not the model — raises the card and records your choice in `gate.json` at the stage root: three-way on the first round, two-way on later rounds (start editing now / show me the change list first);
3. It writes to disk according to that choice:

| Option | Outcome |
| --- | --- |
| Save only, execute later (default, listed first) | `plan.md` + `tasks.md` are written and the planning leg ends there; nothing lands in `current/` |
| Save, then execute now | Both files are written, then this round continues into the task list |
| Something still needs filling in | Nothing is written or produced: the agent asks which part is missing, then asks again |

Until `gate.json` holds an `execute` for **this round**, every call that writes under a stage's `current/` — project-level `<product>/<kind>/` or page-level `<product>/pages/<page-id>/<kind>/` — is **blocked outright** by a `tool_call` hook, with the reason handed back to the model. Consent is per round: the record carries the version count at the moment the card was answered, every `prototype_snapshot` expires it, and the next round asks again — the first card approved a plan, which says nothing about how far a later one-line request may expand. The gate is not "remind the model to ask" — it is an executable door, and that is what separates it from the two earlier prompt-only attempts. When no dialog can be raised (print / json modes), the same record is filled through `ask_user_question` plus a `prototype_gate` call that carries the answer.
After choosing "Save only", `/xpi-prototype-design execute` returns to that leg at any time: the picker lists only stages that **have a task list**, with progress attached (e.g. `subscription-page / wireframe · v1 · 3 files · 任务 2/7`), and the agent resumes from the first unfinished task without re-running discovery or asking for the requirement again.

Each line in `tasks.md` is a checkable ledger entry: `- [ ] 1.2 Empty state (acceptance:…;output:…)`, `⏳ in_progress` while underway, and a tick plus one verification sub-line when done. `prototype_status` reports the same progress as `任务 2/7`, plus a gate line (`gate.json`'s answer, or "no snapshot yet, unconfirmed").

Omit the requirement and a multi-line requirement dialog appears: what you type rides along with the command, submitting with an empty buffer starts the round with no requirement, and Esc abandons it. Submit and newline follow your own `tui.input.submit` / `tui.input.newLine` keybindings — including `alt+enter` on terminals that cannot send it as a distinct sequence (Zed, Alacritty, Terminal.app), where Pi's built-in extension editor would turn it into a newline instead. Only the run modes without dialogs (print / json) skip the dialog and send straight away. `execute` is the exception: it resumes a plan already on disk and **never opens the dialog**. See [`docs/memo-terminal-keybindings.md`](./docs/memo-terminal-keybindings.md) for the whole chain.

The command never creates directories: the project slug is decided by the agent after discovery, so a wrong guess cannot leave empty folders behind. `archive` runs entirely in the command layer and never invokes the agent; `execute` lists only stages that already have task lines in `tasks.md`; `update` asks one extra question — how big is this round — after the requirement and **before** the agent starts, writing the answer straight into `gate.json`. That is why "edit directly" costs a single click and zero tokens; modes without a panel (print / json) ask nothing and write nothing, leaving the agent's own gate call as the fallback.

### Tools

| Tool | Reads | Changes | Refuses |
| --- | --- | --- | --- |
| `prototype_setup` | A project-level stage or one page stage (`pageId`), plus `<cwd>/THEMES.md` | Creates missing dirs and doc skeletons; copies the bundled `THEMES.md` when absent | Never overwrites an existing document or `THEMES.md`; a shared-contract change must name the complete affected set (`sharedContract` + `affectedPageIds`) |
| `prototype_snapshot` | `current/` of the selected stage, project-level or one `pageId` | Writes `v<N>/` and prepends one `CHANGELOG.md` entry; the returned rollback command targets that page's previous `vN` | Refuses when `current/` is empty; refuses an incomplete affected-page set for a shared-contract change |
| `prototype_status` | One `(project, kind)`, or one page stage with `pageId`; every live stage when `project` is omitted | Nothing | Never writes |
| `prototype_preview` | `current/` of the selected stage or page | Opens the file in the OS default browser | Refuses any path outside `current/`; in a multi-page product it refuses to guess and demands `pageId` or `flow` |
| `prototype_gate` | `gate.json` at the stage root (`pageId` selects a page stage) | Raises the card (three-way on the first round, two-way afterwards) and records both the choice and its baseline, plus the page scope in the summary; `mode: "resume"` unlocks a stage that answered "save only" / "show me the change list" | Ignores a model-supplied `answer` whenever a panel exists; refuses `resume` without a `save` record for the current round |
| `prototype_page_impact` | The product map and its reverse link references | Nothing (read-only) | Reports the missing pages instead of accepting an incomplete scope for a shared-contract change |
| `prototype_migration_scan` | Explicitly selected legacy files or directories **inside** the project root | Nothing (read-only); `href` / `src` are read, never rewritten | Refuses any source outside the project root, and any path traversal |
| `prototype_migration_execute` | The same sources plus user-confirmed `decisions` | Copies into `<product>/pages/<page-id>/<kind>/current/`, registers the pages in the product map, writes a migration report | Writes nothing unless the plan has zero unresolved items **and** `confirm` is true; never overwrites an existing target |

The write gate is a `tool_call` hook registered in `gate.ts`: when a `write` / `edit` targets a stage's `current/**` — project-level or page-level — and `gate.json` holds no `execute` for **this round** (wrong answer, or a baseline that no longer matches the version count), the call is blocked and the reason is handed back to the model. The stage ledger (`plan.md`, `tasks.md`) sits outside that gate on purpose — its real content is meant to be written only after the user has confirmed (`prototype_setup` lays down empty skeletons).

`project` is a trust boundary: it must match `/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/`, validated twice (tool schema and `artifacts.ts`). Every path derives from `ctx.cwd`; no tool accepts a filesystem root from the model. Tool output is capped at 2000 characters.

### Artifacts

```text
<cwd>/
├── THEMES.md                          # shadcn oklch tokens — the theme's source of truth
└── .pi/prototype-design/
    ├── <product>/
    │   ├── product-map.json           # stable page ids, implementation, fidelity, routes, links
    │   ├── pages/<page-id>/<kind>/    # page-scoped artifacts, same layout as a stage below
    │   │   ├── plan.md                # requirements; overwritten each round
    │   │   ├── tasks.md               # task list and progress; the execution leg's single source of truth
    │   │   ├── gate.json              # the user's plan-gate answer; current/ stays locked until it says execute
    │   │   ├── principles.md          # hard constraints for the page stage
    │   │   ├── DELTA.md               # hifi only: deviations from the wireframe
    │   │   ├── CHANGELOG.md           # reverse-chronological, newest first
    │   │   ├── current/               # working copy — edit here
    │   │   └── v1/ v2/ ...            # immutable page snapshots
    │   ├── <kind>/                    # legacy project-level stage — still readable, no longer the model
    │   └── migration/                 # migration reports, one file per run
    └── archive/
        ├── CHANGELOG.md               # archive log, with restore commands
        └── 2026-09-13-subscription-page-hifi/
```

Version numbers count per **page stage**, not per product: `wireframe` and `hifi` under one page each keep their own `vN`, and a legacy `<product>/<kind>/` stage keeps counting on its own too. Archiving moves a whole `<kind>/` directory into `archive/` and is reversible via the command recorded in the log.

### Migration

Migration brings explicitly selected legacy prototypes or wireframes into the page model. It is a separate Skill (`xpi-prototype-migration`) and a separate pair of tools: it never runs discovery and never calls a design skill.

1. `prototype_migration_scan { sources }` — read-only. Reports the mapping plan (pages, links, assets, implementation, fidelity) and every **unresolved** item.
2. You decide each unresolved item: page id, implementation, fidelity, target `<product>/pages/<page-id>/<kind>`, and where each non-HTML asset belongs — or why it is excluded.
3. `prototype_migration_execute { project, sources, decisions, confirm: true }` — copies, registers the pages in the product map, runs link validation and a minimum render check, and writes a report to `<product>/migration/<stamp>-migration-report.md`.

Sources are never modified. An existing target is a reported conflict, never an overwrite. Migration only reports **complete** when there are zero unresolved items, zero conflicts and every check passes; otherwise it says so and hands back an `rm -f` command that removes exactly the files that run created.

## Development

```bash
mise install                         # pinned Node.js and pnpm
pnpm install
```

| Gate | Command |
| --- | --- |
| Types | `pnpm typecheck` — `tsc --noEmit` |
| Lint and format | `pnpm -w run lint` — Biome across the repository |
| Tests | `pnpm test` — Vitest (`vitest run --passWithNoTests`) |

All three must pass before committing. Run `pnpm -w run lint` explicitly at the workspace root; the wrapper occasionally misreads a bare `pnpm run lint` as an unknown recursive command.

Two ways to run the extension while working on it:

```bash
pi -e ./src/index.ts                 # smoke test: load once, current run only
```

```bash
ln -s "$(pwd)" ~/.pi/agent/extensions/xpi-prototype-design   # live loop: /reload inside Pi
```

`pi -e` writes nothing to settings; the symlink is picked up from the extensions directory and is removed with `rm`.

## Directory structure

```text
.
├── mise.toml / package.json / biome.jsonc / tsconfig.json / pnpm-workspace.yaml
├── AGENTS.md / CONTEXT.md / DESIGN.md
├── THEMES.md                  # bundled shadcn token template, copied into target projects
├── docs/                      # Git workflow, repository guardrails, learning notes
├── skills/
│   ├── xpi-prototype-design/SKILL.md       # unified orchestration flow + which design skills to call
│   └── xpi-prototype-migration/SKILL.md    # scan → confirm → execute → verify, no design skills
└── src/
    ├── index.ts               # Extension entrypoint (register) + command wiring
    ├── contracts.ts           # Kind/Mode sets, directory layout, CHANGELOG format
    ├── templates.ts           # plan / principles / DELTA / CHANGELOG skeletons
    ├── artifacts.ts           # fs: setup, snapshot, state, preview target (project-level stages)
    ├── page-artifacts.ts      # the same operations scoped to one page id
    ├── product-map.ts         # product map, page ids, links, legacy scan/copy primitives
    ├── migration.ts           # migration review plan, execution, checks, report
    ├── preview.ts             # OS-default-browser launcher
    ├── requirement-editor.ts  # requirement dialog: submit key wins over newline
    ├── tools.ts               # the registered read/write tools
    └── gate.ts                # plan gate tool + the current/ write block
```

## Design baseline

This project adopts the [Google Labs DESIGN.md format](https://github.com/google-labs-code/design.md) tailored for terminal TUI interfaces. See [`DESIGN.md`](./DESIGN.md) for the design tokens (colors, monospace typography, spacing, and component definitions).

## Conventions & constraints

- **Glossary** — [`CONTEXT.md`](./CONTEXT.md) defines the repository's unified terminology; terms must not drift in code, docs, or commits.
- **Git discipline** — read [`docs/GIT-WORKFLOW.md`](./docs/GIT-WORKFLOW.md) and [`docs/GITHUB-GUARD.md`](./docs/GITHUB-GUARD.md) before committing or pushing. The default loop commits and pushes **straight to `main`, with no branch**: run the Git hygiene checkpoint (see §3), then write small, granular Conventional Commits. Branches, PRs, and releases happen only when you ask for them.
- **Token safety** — credentials and secret tokens are never written into code, logs, examples, or documentation.
- **Agent contract** — [`AGENTS.md`](./AGENTS.md) is the single source of truth for this repository. When an oral agreement, older code, or this README disagrees with it, `AGENTS.md` wins.

## Credits

- [Pi Coding Agent](https://github.com/earendil-works/pi) by [earendil-works](https://github.com/earendil-works) — the host this extension plugs into. The extension API, the `ctx.ui` contract, and the package manifest format are theirs.
<!-- TODO: credit every third-party repository you adopt or port from: project name, author, link, license, and what you took. -->

## License

MIT
