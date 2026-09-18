## ADDED Requirements

### Requirement: Fidelity advance is decided by remaining decisions

The system SHALL require an explicit escalation decision before planning any fidelity stage, judged by which decisions remain unresolved and who decides them, and SHALL NOT treat the fidelity ladder as a default path that every page walks.

#### Scenario: Only the implementer decides and the visual system is already fixed

- **WHEN** the user is the only decision maker and the visual system is already established by an existing token contract or component library default
- **THEN** the system SHALL plan the wireframe stage as the last prototype stage for that page
- **THEN** the system SHALL NOT plan a high-fidelity stage

#### Scenario: A non-implementing stakeholder must approve

- **WHEN** a decision maker who does not read implementation code must approve the direction before implementation starts
- **THEN** the system SHALL scope the high-fidelity stage to the minimum that answers the visual-direction question
- **THEN** the system SHALL NOT require whole-product page or state coverage in that stage

#### Scenario: Several visual directions are genuinely open

- **WHEN** two or more visual directions are live candidates
- **THEN** the system SHALL produce one screen per candidate so they can be compared
- **THEN** the system SHALL NOT build a complete flow for any candidate

#### Scenario: The chosen branch is recorded

- **WHEN** the escalation decision is made
- **THEN** the plan SHALL state which branch was chosen and why
- **THEN** a later reader SHALL be able to tell a deliberate skip from an omission

### Requirement: Skipping a stage moves its obligations forward

The system SHALL NOT treat skipping a fidelity stage as removing that stage's obligations; obligations defined for a skipped stage SHALL be discharged in the last stage that is actually produced.

#### Scenario: High-fidelity stage is skipped

- **WHEN** the escalation decision skips the high-fidelity stage
- **THEN** state coverage (normal, empty, loading, error), copy close to real length, and semantic IDs for modifiable elements SHALL be produced in the wireframe stage

#### Scenario: The wireframe output does not carry the moved obligations

- **WHEN** a page skips the high-fidelity stage and its wireframe output lacks any of the moved obligations
- **THEN** the system SHALL NOT present the skip as an acceptable trade
- **THEN** the system SHALL NOT report the round as complete

### Requirement: Structural rework is separated from visual tuning

The system SHALL classify each change made while advancing fidelity as either structural rework or visual tuning, and SHALL report structural rework during a fidelity advance as a violation of the inheritance discipline rather than as a normal part of the stage.

#### Scenario: Advancing changes structure

- **WHEN** advancing to the high-fidelity stage changes block order, information hierarchy, or content placement
- **THEN** the system SHALL register the change as a deviation in the stage's `DELTA.md`
- **THEN** the system SHALL report it as a departure from the inherited structure

#### Scenario: Advancing changes only appearance

- **WHEN** advancing to the high-fidelity stage changes only typography, spacing, density, or color
- **THEN** the system SHALL NOT register a structural deviation

#### Scenario: The same tuning would be repeated in production

- **WHEN** an appearance adjustment would have to be repeated in the production implementation after the prototype stage
- **THEN** the plan SHALL record that adjustment as deferred to the production stage
- **THEN** the system SHALL NOT schedule the same adjustment in the prototype stage
