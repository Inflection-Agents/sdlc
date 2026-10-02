#!/usr/bin/env node
/**
 * The durable spec review log, `specs/review-logs/SPEC-NNN.json` (SPEC-007 > Design > Lever 5).
 * It holds every finding ever raised against a spec, keyed by its content-addressed id, with the
 * rounds it appeared in and a resolution of `open`, `fixed`, `overridden` or `wontfix`. The
 * routing policy reads an owner's ruling from here and from nowhere else (SPEC-007 > D-013).
 *
 * Usage (every command takes --root <dir>):
 *   review-log.mjs append  <spec.md> <envelope.json> --round <n> [--review <label>]
 *                                                                   stamp, validate and record one round;
 *                                                                   an amendment passes its own label
 *   review-log.mjs resolve <spec.md> <F-id> --resolution overridden|wontfix --recorded-by <owner>
 *                          --reason <text> [--owner-severity <sev>]  record an owner's ruling
 *   review-log.mjs project <spec.md>                                print previous_output for the next round
 *   review-log.mjs apply   <spec.md> <envelope.json>                print the envelope with rulings applied
 *   review-log.mjs check                                            every log parses and every ruling is paired
 *
 * Exit codes: 0 done; 1 refused, and nothing was written; 2 usage or an unreadable file.
 */
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { criterionOf, stampEnvelope } from './lib/finding-id.mjs'
import { parseYaml } from './lib/mini-yaml.mjs'
import { sdlcPaths, takeRootArg } from './lib/sdlc-paths.mjs'
import { findById } from './resolve.mjs'
import { parseFrontmatter } from './validate-guide.mjs'
import { validateEnvelope } from './validate-review-envelope.mjs'

export const RANK = { suggestion: 0, nit: 1, major: 2, blocker: 3 }
const RULINGS = new Set(['overridden', 'wontfix'])
const FENCE = /^\s*(```|~~~)/
const today = () => new Date().toISOString().slice(0, 10)

class Refusal extends Error {}
const refuse = (msg) => {
    throw new Refusal(msg)
}

const logDir = (root) => join(sdlcPaths(root, { quiet: true }).specs, 'review-logs')
export const logPath = (root, specId) => join(logDir(root), `${specId}.json`)

export function emptyLog(specId) {
    return { spec: specId, rounds: [], findings: [] }
}

/**
 * A section's raw lines, fenced blocks included. `sectionLines` blanks fenced content, and the
 * schema's own example writes `spec_review_overrides` inside a yaml fence.
 */
function rawSection(text, name) {
    const lines = String(text).split('\n')
    const out = []
    let inFence = false
    let inSection = false
    for (const line of lines) {
        if (FENCE.test(line)) inFence = !inFence
        else if (!inFence && /^## /.test(line)) {
            inSection = line.trimEnd() === `## ${name}`
            continue
        }
        if (inSection) out.push(line)
    }
    return out
}

/** The spec body's `spec_review_overrides` entries, fenced or not. */
export function specOverrides(text) {
    const lines = rawSection(text, 'spec_review_overrides').filter((l) => !FENCE.test(l))
    const body = lines.join('\n').trim()
    if (!body) return []
    const parsed = parseYaml(body)
    return Array.isArray(parsed) ? parsed : []
}

/** A valid, assessed spec-side envelope for this log's spec, stamped. Refuses anything else. */
function admissible(env, log) {
    const stamped = stampEnvelope(env)
    const { ok, abstained, errors } = validateEnvelope(stamped)
    if (!ok) refuse(`the envelope is not valid:\n  - ${errors.join('\n  - ')}`)
    if (abstained) refuse('the reviewer abstained; an abstention is escalated, never logged as a round')
    if (stamped.artifact !== 'spec') refuse(`the review log is for spec reviews; this envelope has artifact "${stamped.artifact}"`)
    if (stamped.artifact_id != null && stamped.artifact_id !== log.spec) {
        refuse(`the envelope is for ${stamped.artifact_id}, not ${log.spec}`)
    }
    return stamped
}

/**
 * Record one round's envelope. `round` is the policy's round within one review (`review`: the
 * authoring review, or one amendment), which restarts at 1; the log numbers rounds globally, in
 * order, and records both on each `rounds[]` entry. A finding seen this round is `open` unless the
 * owner has ruled on it; an `open` finding last seen in an earlier round becomes `fixed`. A round
 * may be appended more than once (round 1 has two reviewers), so a finding marked fixed in this
 * same round that turns up in a second envelope is reopened. A ruled finding raised again above
 * the severity the owner ruled on is reopened, because the owner never saw it at that severity.
 */
export function appendRound(log, env, round, date = today(), review = 'authoring') {
    if (!Number.isInteger(round) || round < 1) refuse(`--round must be a positive integer, got ${round}`)
    const prev = log.rounds.at(-1)
    const prevReview = prev?.review ?? 'authoring'
    const prevRound = prev?.review_round ?? prev?.round ?? 0
    let global
    if (prev && prevReview === review) {
        if (round !== prevRound && round !== prevRound + 1) refuse(`round ${round} of review "${review}" cannot follow its round ${prevRound}`)
        global = round === prevRound ? prev.round : prev.round + 1
    } else {
        if (round !== 1) refuse(`review "${review}" starts at round 1, not ${round}`)
        global = (prev?.round ?? 0) + 1
    }
    const last = prev?.round ?? 0
    const stamped = admissible(env, log)

    const next = structuredClone(log)
    const byId = new Map(next.findings.map((e) => [e.id, e]))
    const seen = new Set()
    for (const f of stamped.findings) {
        seen.add(f.id)
        const fields = {
            severity: f.severity,
            criterion: criterionOf(f),
            location: f.location,
            finding: f.finding,
            suggested_fix: f.suggested_fix ?? null,
            carried_forward_from_previous: f.carried_forward_from_previous === true,
        }
        const e = byId.get(f.id)
        if (!e) {
            const entry = { id: f.id, first_round: global, rounds: [global], ...fields, resolution: 'open' }
            next.findings.push(entry)
            byId.set(f.id, entry)
            continue
        }
        Object.assign(e, fields)
        if (!e.rounds.includes(global)) e.rounds.push(global)
        if (e.resolution === 'fixed') {
            e.resolution = 'open'
            delete e.fixed_in
        }
        if (RULINGS.has(e.resolution) && RANK[e.severity] > RANK[e.ruled_severity]) {
            e.superseded_ruling = { resolution: e.resolution, ruled_severity: e.ruled_severity, owner_severity: e.owner_severity, reason: e.reason, recorded_by: e.recorded_by, date: e.date }
            for (const k of ['ruled_severity', 'owner_severity', 'reason', 'recorded_by', 'date']) delete e[k]
            e.resolution = 'open'
        }
    }
    if (global > last) {
        for (const e of next.findings) {
            if (e.resolution === 'open' && !seen.has(e.id)) {
                e.resolution = 'fixed'
                e.fixed_in = global
            }
        }
    }
    next.rounds.push({ round: global, review, review_round: round, reviewed_by: stamped.reviewed_by, date, findings: stamped.findings.map((f) => f.id) })
    return next
}

/**
 * Every reason a ruled log entry is not backed by the spec. `resolveFinding` refuses on any of them
 * and `check` reports them, so a log written by hand is held to the same rules as one written by
 * this script.
 */
export function rulingProblems(e, specText) {
    const problems = []
    const owner = parseFrontmatter(specText).owner
    if (!owner) problems.push('the spec has no `owner` frontmatter, so no ruling can be recorded')
    else if (e.recorded_by !== owner) problems.push(`recorded_by is "${e.recorded_by}"; only the spec's owner, "${owner}", may record a ruling`)
    if (!e.reason || !String(e.reason).trim()) problems.push('a ruling needs a reason')
    if (!(e.ruled_severity in RANK)) problems.push('a ruling needs the ruled_severity it was made at')
    const body = specOverrides(specText).find((o) => o.finding_id === e.id)
    if (!body) return [...problems, `the spec body has no spec_review_overrides entry for ${e.id}; write it there first`]
    if (e.resolution === 'overridden') {
        if (body.resolution === 'wontfix') problems.push(`the spec body records ${e.id} as wontfix, not overridden`)
        if (body.owner_severity !== e.owner_severity) problems.push(`the log's owner_severity is ${e.owner_severity} but the spec body records ${body.owner_severity ?? 'none'} for ${e.id}`)
        if (body.reviewer_severity !== e.ruled_severity) problems.push(`the spec body records reviewer_severity ${body.reviewer_severity} for ${e.id}, but the log has it at ${e.ruled_severity}`)
        if (!(e.owner_severity in RANK) || !(body.reviewer_severity in RANK) || RANK[e.owner_severity] >= RANK[body.reviewer_severity]) {
            problems.push(`an override only downgrades: ${e.owner_severity} is not below the recorded reviewer_severity ${body.reviewer_severity}`)
        }
    } else {
        if (body.resolution !== 'wontfix') problems.push(`the spec body entry for ${e.id} lacks resolution: wontfix`)
        if (!body.reason || !String(body.reason).trim()) problems.push(`the spec body entry for ${e.id} has no reason`)
        if (RANK[e.ruled_severity] >= RANK.major && !rawSection(specText, 'Disclosed, not reviewed-clean').join('\n').includes(e.id)) {
            problems.push(`${e.id} is a ${e.ruled_severity}; a wontfix on it must also be listed in ## Disclosed, not reviewed-clean`)
        }
    }
    return problems
}

/**
 * Record an owner's `overridden` or `wontfix` ruling. Refused unless `recordedBy` is the spec's
 * owner and the spec body already shows the same ruling, so the log never runs ahead of the spec
 * and the two copies cannot disagree (SPEC-007 > D-017).
 */
export function resolveFinding(log, specText, { id, resolution, recordedBy, reason, ownerSeverity }, date = today()) {
    if (!RULINGS.has(resolution)) refuse(`--resolution must be overridden or wontfix, got ${resolution}`)
    if (!reason || !String(reason).trim()) refuse('--reason is required')
    if (resolution === 'overridden' && !(ownerSeverity in RANK)) refuse(`--owner-severity must be one of ${Object.keys(RANK).join(', ')}`)
    if (!log.findings.some((e) => e.id === id)) refuse(`${id} is not in the review log`)

    const next = structuredClone(log)
    const e = next.findings.find((x) => x.id === id)
    Object.assign(e, { resolution, reason: String(reason), recorded_by: recordedBy, date, ruled_severity: e.severity })
    delete e.fixed_in
    if (resolution === 'overridden') e.owner_severity = ownerSeverity
    else delete e.owner_severity
    const problems = rulingProblems(e, specText)
    if (problems.length) refuse(problems[0])
    return next
}

/** `previous_output` for the next round: the latest round's findings, as an envelope. */
export function project(log) {
    const last = log.rounds.at(-1)
    if (!last) return null
    const latest = log.rounds.filter((r) => r.round === last.round)
    const ids = new Set(latest.flatMap((r) => r.findings))
    return {
        artifact: 'spec',
        artifact_id: log.spec,
        reviewed_by: last.reviewed_by,
        reviewer_status: 'assessed',
        round: last.round,
        findings: log.findings
            .filter((e) => ids.has(e.id))
            .map(({ id, severity, criterion, location, finding, suggested_fix, carried_forward_from_previous }) => ({
                id,
                severity,
                criterion,
                location,
                finding,
                suggested_fix,
                carried_forward_from_previous,
            })),
    }
}

/**
 * The policy's first step on the spec side: drop every `wontfix` finding, and route every
 * `overridden` finding at the owner's severity, never above the reviewer's. Reads the log only.
 */
export function applyRulings(env, log) {
    const ruling = new Map(log.findings.filter((e) => RULINGS.has(e.resolution)).map((e) => [e.id, e]))
    const stamped = admissible(env, log)
    const findings = []
    for (const f of stamped.findings) {
        let r = ruling.get(f.id)
        // A ruling covers the severity the owner saw. Raised higher, the finding routes as raised.
        if (r && !(RANK[f.severity] <= RANK[r.ruled_severity])) r = undefined
        if (r?.resolution === 'wontfix') continue
        if (r?.resolution === 'overridden') {
            const severity = RANK[r.owner_severity] < RANK[f.severity] ? r.owner_severity : f.severity
            findings.push({ ...f, severity, reviewer_severity: f.severity })
        } else findings.push(f)
    }
    return { ...stamped, findings }
}

/** Problems with one log against its spec: shape, and every ruling the spec does not back. */
export function checkLog(log, specText, expectedSpec) {
    const problems = []
    if (!log || !Array.isArray(log.rounds) || !Array.isArray(log.findings)) return ['not a review log: `rounds` and `findings` must be arrays']
    if (expectedSpec && log.spec !== expectedSpec) problems.push(`the log is for ${log.spec}, but its file is named for ${expectedSpec}`)
    for (const e of log.findings) {
        if (!/^F-[0-9a-f]{8}$/.test(String(e.id))) problems.push(`${e.id}: not a content-addressed id`)
        if (!['open', 'fixed', 'overridden', 'wontfix'].includes(e.resolution)) problems.push(`${e.id}: resolution "${e.resolution}" is not one of open, fixed, overridden, wontfix`)
        if (!RULINGS.has(e.resolution)) continue
        for (const p of rulingProblems(e, specText ?? '')) problems.push(`${e.id}: ${p}`)
    }
    return problems
}

// ── CLI ──────────────────────────────────────────────────────────────────────

function flag(args, name) {
    const i = args.indexOf(name)
    if (i === -1) return undefined
    const v = args[i + 1]
    args.splice(i, 2)
    return v
}

function readJson(file) {
    return JSON.parse(readFileSync(file, 'utf8'))
}

function loadSpec(arg) {
    const file = resolve(arg)
    if (!existsSync(file)) {
        process.stderr.write(`review-log: cannot read ${arg}\n`)
        process.exit(2)
    }
    const text = readFileSync(file, 'utf8')
    const id = parseFrontmatter(text).id
    if (!/^SPEC-\d{3}$/.test(String(id))) {
        process.stderr.write(`review-log: ${arg} has no SPEC-NNN id in its frontmatter\n`)
        process.exit(2)
    }
    return { text, id }
}

function loadLog(root, id) {
    const p = logPath(root, id)
    return existsSync(p) ? readJson(p) : emptyLog(id)
}

function save(root, id, log) {
    const p = logPath(root, id)
    mkdirSync(dirname(p), { recursive: true })
    // A committed symlink here would redirect the write anywhere the operator can write.
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) refuse(`${p} is a symlink; the review log must be a regular file`)
    writeFileSync(p, `${JSON.stringify(log, null, 2)}\n`, 'utf8')
    return p
}

const USAGE = 'usage: review-log.mjs [--root <dir>] (append <spec> <envelope> --round <n> [--review <label>] | resolve <spec> <F-id> --resolution <r> --recorded-by <who> --reason <text> [--owner-severity <s>] | project <spec> | apply <spec> <envelope> | check)\n'

function main(argv) {
    const { root, rest } = takeRootArg(argv)
    const args = [...rest]
    const cmd = args.shift()
    try {
        if (cmd === 'append') {
            const roundArg = flag(args, '--round')
            const review = flag(args, '--review') ?? 'authoring'
            const [specArg, envArg] = args
            if (!specArg || !envArg || roundArg === undefined) throw new Error('usage')
            const round = Number(roundArg)
            const { id } = loadSpec(specArg)
            const p = save(root, id, appendRound(loadLog(root, id), readJson(envArg), round, today(), review))
            process.stdout.write(`review-log: ${review} round ${round} recorded in ${p}\n`)
        } else if (cmd === 'resolve') {
            const opts = {
                resolution: flag(args, '--resolution'),
                recordedBy: flag(args, '--recorded-by'),
                reason: flag(args, '--reason'),
                ownerSeverity: flag(args, '--owner-severity'),
            }
            const [specArg, fid] = args
            if (!specArg || !fid || !opts.resolution || !opts.recordedBy || !opts.reason) throw new Error('usage')
            const { text, id } = loadSpec(specArg)
            const p = save(root, id, resolveFinding(loadLog(root, id), text, { ...opts, id: fid }))
            process.stdout.write(`review-log: ${fid} recorded as ${opts.resolution} in ${p}\n`)
        } else if (cmd === 'project') {
            const { id } = loadSpec(args[0] ?? '')
            process.stdout.write(`${JSON.stringify(project(loadLog(root, id)), null, 2)}\n`)
        } else if (cmd === 'apply') {
            const [specArg, envArg] = args
            if (!specArg || !envArg) throw new Error('usage')
            const { id } = loadSpec(specArg)
            process.stdout.write(`${JSON.stringify(applyRulings(readJson(envArg), loadLog(root, id)), null, 2)}\n`)
        } else if (cmd === 'check') {
            const dir = logDir(root)
            const logs = existsSync(dir) ? readdirSync(dir).filter((f) => /^SPEC-\d{3}\.json$/.test(f)) : []
            let bad = 0
            for (const f of logs.sort()) {
                const id = f.replace(/\.json$/, '')
                // An archived spec still owns its log, so resolve by id rather than by directory, and
                // take the spec file itself, never its ledger under decisions/.
                const specFile = findById(id, root).find((s) => /^SPEC-\d{3}-.*\.md$/.test(basename(s)) && /(^|[\\/])specs$/.test(dirname(s)))
                const specText = specFile ? readFileSync(specFile, 'utf8') : ''
                let problems
                try {
                    problems = checkLog(readJson(join(dir, f)), specText, id)
                } catch (err) {
                    problems = [`unreadable: ${err.message}`]
                }
                for (const p of problems) process.stdout.write(`${f}: ${p}\n`)
                if (problems.length) bad += 1
            }
            if (bad) {
                process.stderr.write(`review-log: ${bad} log(s) have problems\n`)
                process.exit(1)
            }
            process.stdout.write(`review-log: ${logs.length} log(s) consistent with their specs\n`)
        } else {
            throw new Error('usage')
        }
    } catch (err) {
        if (err instanceof Refusal) {
            process.stderr.write(`review-log: refused, nothing written: ${err.message}\n`)
            process.exit(1)
        }
        if (err.message === 'usage') {
            process.stderr.write(USAGE)
            process.exit(2)
        }
        process.stderr.write(`review-log: ${err.message}\n`)
        process.exit(2)
    }
}

function isMain(metaUrl) {
    const entry = process.argv[1]
    if (!entry) return false
    try {
        return realpathSync(entry) === realpathSync(fileURLToPath(metaUrl))
    } catch {
        return resolve(entry) === fileURLToPath(metaUrl)
    }
}

if (isMain(import.meta.url)) main(process.argv.slice(2))
