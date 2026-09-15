## 1. Domain Model and Product Map

- [x] 1.1 Define project-level product map and page ID contracts for implementation source, fidelity, route, prototype entry, and links; verify valid mixed-maturity fixtures and reject duplicate or unsafe IDs.
- [x] 1.2 Add product-map persistence and read-only status reporting; verify a product with production, wireframe, hifi, and ordinary prototype pages renders as one page map.
- [x] 1.3 Add link resolution and reverse-reference validation; verify fidelity changes preserve stable targets and unresolved targets fail validation.

## 2. Page-Scoped Artifact Operations

- [x] 2.1 Establish page-scoped artifact layout and migration-compatible read behavior; verify sibling pages remain independently addressable.
- [x] 2.2 Bind planning records, tasks, gate baseline, snapshots, CHANGELOG entries, and rollback targets to page scope; verify a single-page operation cannot silently authorize sibling pages.
- [x] 2.3 Update preview resolution to accept page identity and product-flow entry points; verify preview never selects an arbitrary first HTML file for a multi-page product.
- [x] 2.4 Add shared-navigation impact detection and explicit affected-page reporting; verify shared contract changes require the complete affected set.

## 3. Unified Human-Friendly Command Flow

- [x] 3.1 Replace multi-mode user parsing with a single `/xpi-prototype-design` kickoff while preserving internal operation dispatch; verify bare entry starts the orchestrator and cancellation performs no write.
- [x] 3.2 Implement progressive structured choices for goal, product, page scope, design action, and fidelity transition; verify users are not required to enter internal modes or `--*` parameters.
- [x] 3.3 Update planning and iteration gate summaries to show human-readable page scope, current state, planned changes, and exclusions; verify save, execute, supplement, and resume semantics remain fail-closed.
- [x] 3.4 Update the orchestration Skill with the unified entry workflow and page-boundary rules; verify the documented flow selects only relevant design skills and does not ask duplicate questions.

## 4. Migration Capability

- [x] 4.1 Add read-only migration scanning for explicitly selected legacy files or directories; verify source files are never modified and path traversal is rejected.
- [x] 4.2 Generate migration findings and a user-reviewable mapping plan for pages, links, assets, implementation source, and fidelity; verify uncertain mappings are reported instead of guessed silently.
- [x] 4.3 Add confirmed migration execution into the current project root without overwriting existing targets; verify partial migration and conflicts are recoverable.
- [x] 4.4 Add migration reports, link validation, and minimum render checks; verify completion is not reported when unresolved warnings or broken links remain.
- [x] 4.5 Add the `migrate` user-facing choice and a dedicated migration Skill; verify migration is reachable from the unified entry and remains distinct from ordinary page design.

## 5. Compatibility and Verification

- [x] 5.1 Define read-only compatibility or migration guidance for existing stage-based artifacts; verify historical snapshots remain readable and no legacy data is silently deleted.
- [x] 5.2 Update unit and integration tests for mixed maturity, page isolation, command interaction, gate enforcement, migration safety, preview, and rollback; verify targeted and full suites pass.
- [x] 5.3 Update README, CONTEXT, and design workflow documentation to use product/page terminology and explain the unified entry; verify documented commands and artifacts match runtime behavior.
- [x] 5.4 Run `pnpm typecheck`, `pnpm -w run lint`, and `pnpm test`; verify all three required gates pass before declaring the change complete.
