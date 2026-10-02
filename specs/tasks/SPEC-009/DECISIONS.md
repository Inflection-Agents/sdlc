# SPEC-009 — decision log

One entry per guide step, appended after it merges. An `EXECUTIVE DECISION` or `SPEC DEVIATION`
heading goes in the moment it happens, not batched at the end.

This log is what makes the narrow escalation bar safe. `spec-execution` escalates on four
checkable triggers and decides everything else; without a written record that trade is
invisible, and a reader cannot reconstruct why a run diverged. Entries are append-only and
in chronological order.

---

## EXECUTIVE DECISION — SPEC-003 is superseded, not completed

**Date:** 2026-10-02
**Question:** D1 says SPEC-003 is closed through `spec-completion` before S1. The step PRs of SPEC-003 merged into `feat/spec-003`, which never merged to `main`, so no success criterion holds on `main`.
**Decided:** set SPEC-003 to `superseded`, with a changelog entry naming the stranded branch and the work that replaced each criterion. `spec-completion` names `superseded` as the status for a spec that another spec replaces.
**Why:** `completed` would claim criteria that are not true on `main`. `deprecated` would say the work was abandoned, but later work replaced it.
**Reversal path:** set SPEC-003 back to `active` and restore its task tree from `specs/archive/`.

---

## EXECUTIVE DECISION — no session task-list tool

**Date:** 2026-10-02
**Question:** the skill asks for a visible task list through a todo surface, and this session has none.
**Decided:** step status lives in `_index.yaml`, in this log, and in a status line the executor reports after each step merges.
**Why:** those three surfaces already have to agree, and none of them can drift from a todo list that does not exist.
**Reversal path:** none needed.

`archive-specs.mjs --dry-run` reports nothing to archive. Denylist clause 1 holds SPEC-003 in the live corpus: `skills/spec-schema.md:236` and `skills/intent-triage/SKILL.md:103` use "SPEC-003" as example text. This is the false positive the backlog item "Denylist clause 1 pins a consuming repo's specs on the framework's own example numbers" describes, and it is left alone here.

---

## EXECUTIVE DECISION — guide change: S1 adds a YAML subset parser and registers the config schema doc

**Date:** 2026-10-02
**Question:** S1's `Changes:` did not list a parser, but `config.yaml` is nested (maps inside lists, flow lists), and every existing script hand-parses only the slice of YAML it needs. `validate-state-machine.mjs` also counts every `skills/*.md` file as a skill, so the new `skills/sdlc-config-schema.md` fails it unless the doc is registered.
**Decided:** add `scripts/sdlc/lib/mini-yaml.mjs` and its test, a dependency-free subset parser and emitter that throws on any shape it does not support. Add `sdlc-config-schema` under `exempt:` in both state machines, next to `guide-schema`. S1's `Changes:` now lists these files.
**Why:** a dependency would break the bare-`node` CI the payload relies on. A fifth hand-rolled parser would be one more reader that disagrees with the others. S4 and S6 reuse this one.
**Reversal path:** delete the two files and the two `exempt:` lines.
