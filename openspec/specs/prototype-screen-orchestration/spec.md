# prototype-screen-orchestration Specification

## Purpose

为同一产品中的多个页面提供稳定身份、混合成熟度，以及不受阶段切换破坏的页面链接与设计推进能力；产品地图是页面身份的事实来源，页面级操作彼此隔离。

## Requirements

### Requirement: Product pages have stable identities
The system SHALL represent each product page with a project-scoped stable page ID, human-readable name, implementation source, fidelity, and optional route reference.

#### Scenario: Mixed page maturity is represented
- **WHEN** a product contains production, wireframe, high-fidelity, and ordinary prototype pages
- **THEN** the system SHALL represent them together without forcing them into one project-wide fidelity

#### Scenario: Page fidelity advances
- **WHEN** a page advances from wireframe to high-fidelity
- **THEN** its stable page ID and declared links SHALL remain unchanged

### Requirement: Page links use stable targets
The system SHALL resolve internal prototype links through stable page IDs rather than requiring callers to depend on versioned or stage-specific file paths.

#### Scenario: Link survives fidelity change
- **WHEN** the target page changes its artifact from wireframe to high-fidelity
- **THEN** a link addressed to that page ID SHALL continue to resolve to the current declared target

#### Scenario: Unresolved link is detected
- **WHEN** a page declares a target page ID that is not registered
- **THEN** validation SHALL report the unresolved target and SHALL NOT claim the product map is valid

### Requirement: Page-scoped operations preserve boundaries
The system SHALL scope planning, status, preview, snapshot, rollback, and write authorization to the selected page or explicitly selected page set.

#### Scenario: Single page update
- **WHEN** the user updates one page in a mixed-maturity product
- **THEN** the operation SHALL identify that page as its scope and SHALL not silently modify sibling pages

#### Scenario: Shared contract change
- **WHEN** an operation changes shared navigation or page links
- **THEN** the system SHALL display the affected pages before execution and require explicit confirmation

### Requirement: Product status shows the page map
The system SHALL provide a product-level view listing registered pages, maturity, implementation source, versions, and link validation status.

#### Scenario: User chooses next work
- **WHEN** the user requests design progress
- **THEN** the status view SHALL make it possible to identify which page can be created, continued, migrated, or advanced next
