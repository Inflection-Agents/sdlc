// A finding's id, derived from what it says rather than where it sits in a list (ADR-006,
// SPEC-007 Lever 4). The same defect raised in two rounds gets the same id, so an override
// or a wontfix recorded against it still applies.
import { createHash } from 'node:crypto'

/**
 * The location as hashed. A PR finding's `file:line` loses its line, because edits between
 * rounds shift lines; a spec finding's section heading is used as written.
 */
export function locationKey(location, artifact) {
    const loc = String(location ?? '')
    return artifact === 'spec' ? loc : loc.replace(/:\d+(-\d+)?$/, '')
}

/** `criterion`, or its `citation` alias when `criterion` is absent. */
export const criterionOf = (f) => f?.criterion ?? f?.citation

/** `F-` and the first 8 hex digits of sha256(location_key NUL criterion NUL finding). */
export function findingId(f, artifact) {
    const parts = [locationKey(f.location, artifact), String(criterionOf(f) ?? ''), String(f.finding ?? '')]
    return `F-${createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 8)}`
}

/** Whether a finding carries the fields its id is computed from. */
export const hashable = (f) =>
    f && typeof f === 'object' && typeof f.location === 'string' && typeof f.finding === 'string' && typeof criterionOf(f) === 'string'

/** A copy of `env` with every hashable finding's id set from its content. */
export function stampEnvelope(env) {
    if (!env || typeof env !== 'object' || !Array.isArray(env.findings)) return env
    return { ...env, findings: env.findings.map((f) => (hashable(f) ? { ...f, id: findingId(f, env.artifact) } : f)) }
}
