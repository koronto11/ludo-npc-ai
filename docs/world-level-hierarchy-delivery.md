# World and level hierarchy — 2026-10-07

- Project/world: shared world name, premise, confirmed writing rules and tone. The world editor no longer edits a region.
- Level: optional `region` and `description` for local setting, story phase and conflict. Both are visible in level creation and settings; existing description is edited in one place.
- Breadcrumb: world / current level, each with a direct editing entry. Global relationship view uses the world name.
- Compatibility: legacy `world.district` survives loading and unrelated edits. The selected level offers explicit transfer; save atomically writes its region and clears the old field. A changed legacy field refuses transfer. No automatic assignment to the first level; no authored prose rewrite.
- Generation: typed scene context selects the precise level/track, scenario context may select a level, and unscoped requests have no level. Legacy global region is excluded from world generation context. Empty new regions preserve old author hashes; nonempty edits affect draft staleness.
- Design-note exports include level region. Bilingual help, current Skill schemas/examples/reference guides and ZIP packages are synchronized.

## Verification

- Production build passed; Sites packaging outputs retained.
- 314 backend tests and 139 frontend tests passed, including Sites worker tests. Final changed localization/world/metadata checks: 20 passed. Updated bilingual bridge examples: 14 passed. Seven generated contract/sample files checked; Ruff passed for changed Python implementation/tests.
- Independent local UI fixture: transfer region and edit description, save and reopen, confirm another level unchanged, create a third level with region/description, verify English and 390×844 layout with visible save action and no dialog horizontal overflow.
- Browser console: no errors during these checks.
- User project remains content revision 4, with original world prose/legacy region and both levels unchanged. Existing model configuration remains available. Current service restarted on localhost:4184; isolated test service stopped.
- No real provider request was made. No Windows package or clean-machine release acceptance was performed for this change.

Screenshots: `audits/world-level-20261007/current-level-settings-zh.jpg` and `audits/world-level-20261007/level-settings-mobile-en.jpg`.
