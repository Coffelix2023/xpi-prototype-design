# xpi-prototype-design

**English** · [简体中文](./README.zh-CN.md)

**A Pi Coding Agent extension that turns design discussions into versioned, reviewable prototype artifacts.**

**把设计讨论落成可版本化、可评审的原型产物的 Pi Coding Agent 扩展。**

<!-- TODO: add a LICENSE file (MIT) — the badge below links to it -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](./LICENSE)

```text
> /xpi-prototype-design
```

## Why

While the design conversation is in the chat it is fine; the moment it ends, nobody can tell which revision was approved. A wireframe gets signed off, the high-fidelity pass quietly drops a CTA, and the only record is scrollback. This extension keeps the loop on disk, inside the project, and versioned: structured discovery rounds land in a `plan.md`, output goes into a `current/` working copy, and every round is snapshotted to `vN/` with a rollback command recorded in one reverse-chronological `CHANGELOG.md`. Theme tokens come from a `THEMES.md` that the extension scaffolds once and never overwrites.

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
| `/xpi-prototype-design` | List the four modes and pick one |
| `/xpi-prototype-design wireframe <requirement>` | Start a wireframe design |
| `/xpi-prototype-design hifi [<requirement>]` | Start a hifi design — build on an existing wireframe, or go from scratch |
| `/xpi-prototype-design update` | Pick an existing project to revise |
| `/xpi-prototype-design archive` | Pick a finished project to archive |

Argument completion is fuzzy, so a first letter is enough (`w` → `wireframe`). Typing the command with a trailing space lists all four.

Omit the requirement and the kickoff is prefilled into the editor instead of being sent: you add the goal, then press enter. Only the run modes without an editor (print / json) send straight away.

The command never creates directories: the project slug is decided by the agent after discovery, so a wrong guess cannot leave empty folders behind. `archive` runs entirely in the command layer and never invokes the agent.

### Tools

| Tool | Reads | Changes | Refuses |
| --- | --- | --- | --- |
| `prototype_setup` | `<cwd>/.pi/prototype-design/<project>/<kind>/`, `<cwd>/THEMES.md` | Creates missing dirs and doc skeletons; copies the bundled `THEMES.md` when absent | Never overwrites an existing document or `THEMES.md` |
| `prototype_snapshot` | `<cwd>/.pi/prototype-design/<project>/<kind>/current/` | Writes `v<N>/` and prepends one `CHANGELOG.md` entry | Refuses when `current/` is empty |
| `prototype_status` | One `(project, kind)`; every live one when `project` is omitted | Nothing | Never writes |
| `prototype_preview` | `<cwd>/.pi/prototype-design/<project>/<kind>/current/` | Opens the file in the OS default browser | Refuses any path outside `current/` |

`project` is a trust boundary: it must match `/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/`, validated twice (tool schema and `artifacts.ts`). Every path derives from `ctx.cwd`; no tool accepts a filesystem root from the model. Tool output is capped at 2000 characters.

### Artifacts

```text
<cwd>/
├── THEMES.md                          # shadcn oklch tokens — the theme's source of truth
└── .pi/prototype-design/
    ├── <project>/                     # kebab-case, e.g. subscription-page
    │   └── <kind>/                    # wireframe | hifi
    │       ├── plan.md                # requirements; overwritten each round
    │       ├── principles.md          # hard constraints for the stage
    │       ├── DELTA.md               # hifi only: deviations from the wireframe
    │       ├── CHANGELOG.md           # reverse-chronological, newest first
    │       ├── current/               # working copy — edit here
    │       └── v1/ v2/ ...            # immutable snapshots
    └── archive/
        ├── CHANGELOG.md               # archive log, with restore commands
        └── 2026-09-13-subscription-page-hifi/
```

Version numbers count per **stage**, not per project: `wireframe` and `hifi` under one project each keep their own `vN`. Archiving moves a whole `<kind>/` directory into `archive/` and is reversible via the command recorded in the log.

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
├── docs/                      # Git workflow and repository guardrails
├── skills/xpi-prototype-design/SKILL.md   # stage flow + which design skills to call
└── src/
    ├── index.ts               # Extension entrypoint (register) + the two subcommands
    ├── contracts.ts           # Kind enum, directory layout, CHANGELOG format
    ├── templates.ts           # plan / principles / DELTA / CHANGELOG skeletons
    ├── artifacts.ts           # fs: setup, snapshot, state, preview target
    ├── preview.ts             # OS-default-browser launcher
    └── tools.ts               # the four registered tools
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
