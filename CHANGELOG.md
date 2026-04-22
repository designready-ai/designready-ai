# Changelog

All notable changes to DesignReady.ai are documented in this file.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.0] — 2026-04-22

Maintenance and quality release based on a full README-vs-code audit. One real bug fix in batch prompts, several documentation corrections, and an expanded responsive detection.

### Added
- Responsive-suffix detection now recognises Tailwind-style breakpoints (`xs`, `2xl`, `3xl`) plus `phone` and `laptop` long forms, and an allowlist of common Figma frame widths (`320`, `375`, `428`, `768`, `1024`, `1194`, `1280`, `1440`, `1920`, …). Previously only `desktop|mobile|tablet|sm|md|lg|xl|xxl` were recognised. Single-letter tokens (`s`, `m`, `l`) are deliberately excluded to avoid false positives.
- `ComponentSet Variants` section in the README documenting the current behaviour (only the Default variant is serialised as a full layout tree) and the Batch Scan workaround for structurally different variants.
- Mention of the 60% confidence threshold for Auto Layout Fix in the README features list, plus the three possible skip reasons.
- Dedicated tests for `extractBaseName` (plugin side) and `detectViewport` (shared), covering boundary cases and false-positive safeguards.
- Vitest config now includes `plugin/**/__tests__/**/*.test.ts` so pure helpers on the plugin side can be covered.

### Fixed
- **Skill-sync block was duplicated N+1 times in batch prompts.** The block was renamed from `## skill-sync` to `# TASK 2 — Skill Sync` but the regex in `batch-scanner.ts` that stripped per-component blocks still matched the old marker. Result: the Skill Sync block appeared once per component plus once at the end. Now passed through `skipSkillSync` to `scan()` so the block is emitted exactly once, at the end of the batch prompt.
- **Viewport detection gap for 1025–1199px frames.** Frames in this range (iPad Pro landscape at 1180/1194, Bootstrap containers at 1128, generic mid-desktops at 1100) were classified as `"unknown"` because the logic required `>= 1200` for desktop. Claude received no semantic viewport signal for these. Fixed by treating anything above 1024 as `desktop`; `"unknown"` is now reserved for zero/negative widths.

### Changed
- Viewport classification deduplicated into `shared/viewport.ts`. `detectViewport(width): ViewportType` is now the single source of truth for both plugin and UI sandboxes. Previous hand-duplicated copies (`detectViewportType` in the plugin, `viewportTag` in the UI) have been removed.
- `README.md` and `CLAUDE.md` corrected for several stale references:
  - Skill-sync block name (`## skill-sync` → `# TASK 2 — Skill Sync`)
  - Batch prompt threshold (60+ average, separate from the 75+ standalone gate) is now documented
  - Test count updated (84 → 105)
  - Stale claim that `CLAUDE.md` is gitignored replaced with the actual push workflow (`official-updates` → `official/main`)
- CLAUDE.md compact rewrite. Architecture note extended to document `shared/viewport.ts` as the pattern for pure cross-sandbox utilities.

## [1.0.0] — 2026-03-26

Initial public release.

- 6-Dimension Scoring (Naming, Structure, Tokens, Meta, Completeness, Variants)
- Compact prompt generation with self-check and state hints
- Skill Sync block for Claude-side design system maintenance
- Design System Profiles with import from Figma Variables, Paint Styles, and local components
- Batch Mode with atomic build order (atoms → molecules → organisms)
- Auto Layout Fix with confidence-based analysis
- Quick Fixes (rename generic layers, convert dividers, delete hidden/empty nodes)
- Atomic Detection (atom/molecule/organism classification)
- Responsive viewport detection from sibling frames
- Prompt injection protection via sanitisation of layer names and text content

[Unreleased]: https://github.com/designready-ai/designready-ai/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/designready-ai/designready-ai/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/designready-ai/designready-ai/releases/tag/v1.0.0
