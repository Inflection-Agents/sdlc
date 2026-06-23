export const meta = {
    name: 'execute-spec',
    description:
        'Execute a SPEC end-to-end deterministically: topo-waves -> worktree executors -> Tier-0 gate -> routed multi-lens review -> fix loop (<=3) -> per-wave integration merge -> integration EVIDENCE -> integration PR (a human merges to main).',
    phases: [
        { title: 'Plan', detail: 'read _index.yaml + task files + review-constraints.yaml; build the wave graph' },
        { title: 'Build', detail: 'per task: execute -> Tier-0 gate -> routed review -> fix (<=3) -> merge into integration' },
        { title: 'Integrate', detail: 'expensive verify (EVIDENCE) -> open feat/SPEC-NNN -> main, or HALT' }
    ]
}

// ============================================================================
// REFERENCE deterministic execution engine for the AI-native SDLC.
//
// `export const meta` MUST be the FIRST statement (the Workflow tool reads it
// statically). The Workflow runtime has NO filesystem / `import` / Date.now /
// Math.random — everything is INLINE and pure where it can be.
//
// This is the operational implementation of the `spec-execution` skill. The
// design rule is a strict PURE-CORE / EFFECTS-AT-THE-EDGES split: routing,
// verdicts, branch names, and wave planning are TOTAL FUNCTIONS (unit-testable,
// no agents); only the thin `agent()` wrappers near the bottom touch the model.
//
// Re-runs are idempotent: branch names are pure functions of the task id, so a
// re-run reuses the SAME branch + PR. Resume is wave-level: a task is `done`
// once its branch is merged into the integration branch and its `_index.yaml`
// status is set (committed together, per branch); a re-run skips `done` tasks.
//
// Ported from the downstream `execute-spec.js` engines; genericized to a single
// `_default` workspace. To specialize a workspace, add an entry to WORKSPACES
// (Tier-0 commands + optional expensive verify) and, if needed, a domain skill
// — never a specialized executor. "One generic executor; specialization is data."
// See .ai/skills/spec-execution/SKILL.md and .ai/skills/review-primitives.md.
// ============================================================================

// ----------------------------------------------------------------------------
// PURE CORE — immutable config + total functions. No side effects, no agents.
// ----------------------------------------------------------------------------

// Workspace = data, not a specialized executor. One generic `executor`;
// per-workspace differences are the Tier-0 gate, and an optional expensive
// verification command run once at the integration gate. Replace `_default`'s
// commands with this repo's real cheap gate, and add named workspaces as needed.
const WORKSPACES = {
    // example:
    // web: {
    //     execute: 'executor', verify: 'tester',
    //     tier0: ['npm run lint', 'npm run typecheck', 'npm test'],
    //     expensiveVerify: 'e2e',            // e.g. Playwright; null if none
    //     domainSkill: 'web-app-patterns'    // null if none authored yet
    // },
    _default: {
        execute: 'executor',
        verify: 'tester',
        tier0: ['npm run lint', 'npm run typecheck', 'npm test'],
        expensiveVerify: null,
        domainSkill: null
    }
}
const wsOf = (task) => WORKSPACES[task && task.workspace] || WORKSPACES._default

// lens -> special reviewer agent; anything unmapped is graded by the generic `task-reviewer`.
const SPECIAL_REVIEWER = {
    'design-fidelity': 'design-fidelity-reviewer',
    'core-purity': 'invariants-reviewer',
    'security': 'invariants-reviewer'
    // note: integration-scope lenses (e.g. contract-parity) are graded by integration-reviewer
    // at the integration gate, so they are intentionally NOT mapped here.
}
const lensToAgent = (lens) => SPECIAL_REVIEWER[lens] || 'task-reviewer'

// --- tiny functional toolkit ---
const uniq = (xs) => [...new Set(xs)]
const groupBy = (xs, key) => xs.reduce((m, x) => ({ ...m, [key(x)]: [...(m[key(x)] || []), x] }), {})

// glob -> anchored regex (`**` = any depth, `*` = within one segment); a constraint matches a
// task when ANY of its `when.touches` globs matches ANY of the task's touch globs.
const globToRe = (g) =>
    new RegExp(
        '^' +
            String(g).replace(/\*\*\/|\/\*\*|\*\*|\*|[.+^${}()|[\]\\]/g, (m) =>
                m === '**/' ? '(?:.*/)?' : m === '/**' ? '(?:/.*)?' : m === '**' ? '.*' : m === '*' ? '[^/]*' : '\\' + m
            ) +
            '$'
    )
// overlap is bidirectional-ish: a task glob matches a constraint glob if either names a concrete
// sample of the other (sound-positive; sufficient for the registry's narrow globs).
const sample = (g) => String(g).replace(/\*\*\/|\/\*\*|\*\*|\*/g, (m) => (m === '*' ? 'x' : 'x/x'))
const globsOverlap = (a, b) => globToRe(a).test(sample(b)) || globToRe(b).test(sample(a))
const anyGlob = (globs, files) => (globs || []).some((g) => (files || []).some((f) => globsOverlap(g, f)))

// --- pure selectors over a task = { id, workspace, touches[], tier?, risk?, routing?/agent?, depends_on[], status, acceptance_criteria[] } ---
const depId = (d) => (typeof d === 'string' ? d : d && d.id)
const dependsOf = (task) => (task.depends_on || []).map(depId).filter(Boolean)
const filesOf = (task) => (Array.isArray(task && task.touches) ? task.touches.filter((s) => typeof s === 'string') : [])
const hasTouches = (task) => filesOf(task).length > 0

const constraintApplies = (c, task) =>
    anyGlob(c.when && c.when.touches, filesOf(task)) ||
    ((c.when && c.when.workspace) || []).includes(task.workspace) ||
    Boolean(c.when && c.when.task_has && task[c.when.task_has])
const applicableConstraints = (constraints, task) =>
    (constraints || []).filter((c) => (c.scope || 'task') === 'task' && constraintApplies(c, task))
const integrationConstraintsFor = (constraints, workspaces) =>
    (constraints || []).filter(
        (c) => c.scope === 'integration' && (!(c.when && c.when.workspace) || c.when.workspace.some((w) => workspaces.includes(w)))
    )

const baseLensesFor = (cfg, task) => (cfg.baseLenses && (cfg.baseLenses[task.workspace] || cfg.baseLenses._default)) || []
const tripsBlocker = (constraints, task) => applicableConstraints(constraints, task).some((c) => c.severity === 'blocker')
const tripsGuarded = (constraints, task) =>
    applicableConstraints(constraints, task).some((c) => c.severity === 'blocker' || c.severity === 'major')

// tier resolver: a registry blocker (or declared high risk) => fortified; express is only granted
// for a declared-low-risk, well-scoped task that trips no blocker/major; everything else standard.
const tier = (constraints, task) => {
    if (tripsBlocker(constraints, task) || task.risk === 'high') return 'fortified'
    if ((task.tier || 'standard') === 'express' && !tripsGuarded(constraints, task) && task.risk === 'low' && hasTouches(task))
        return 'express'
    return 'standard'
}
// review team = base(workspace) ∪ {lens of each applicable constraint}; express => base only.
const lensesFor = (cfg, constraints, task) =>
    uniq([...baseLensesFor(cfg, task), ...applicableConstraints(constraints, task).map((c) => c.lens)])
const lensesForTier = (cfg, constraints, task) =>
    tier(constraints, task) === 'express' ? baseLensesFor(cfg, task) : lensesFor(cfg, constraints, task)
const checksForLens = (constraints, task) => groupBy(applicableConstraints(constraints, task), (c) => c.lens)

// --- routing / status ---
const routingOf = (task) => task.routing || task.agent || 'claude-code'
const isDeferred = (task) => new Set(['human']).has(routingOf(task))
const isDone = (task) => new Set(['done', 'merged', 'completed', 'cancelled', 'superseded']).has(task.status)

// --- contract validation (HARD gate; refuse to run a malformed declared contract) ---
const TIER_ENUM = new Set(['express', 'standard', 'fortified'])
const RISK_ENUM = new Set(['low', 'medium', 'high'])
const validateContract = (task) => {
    const id = (task && task.id) || '<unknown>'
    const errors = []
    if (!hasTouches(task)) errors.push(`${id}: touches must be a non-empty flat string[] of globs`)
    if (!new Set(['claude-code', 'human']).has(routingOf(task))) errors.push(`${id}: routing "${routingOf(task)}" not in { claude-code, human }`)
    if (task.tier != null && !TIER_ENUM.has(task.tier)) errors.push(`${id}: tier "${task.tier}" invalid`)
    if (task.risk != null && !RISK_ENUM.has(task.risk)) errors.push(`${id}: risk "${task.risk}" invalid`)
    return { valid: errors.length === 0, errors }
}

// --- pure verdict logic ---
const isBlocking = (f) => f && (f.severity === 'blocker' || f.severity === 'major')
const gate = (findings) => ((findings || []).some(isBlocking) ? 'fix_loop' : 'accept')
const ALLOWED_PREFIX = ['ac:', 'inv:', 'design:', 'lens:', 'task:scope', 'spec:'] // review-primitives.md > Grounding rules
const critOf = (f) => (f && (f.criterion || f.citation)) || ''
const groundedFinding = (f) => !!f && typeof f === 'object' && typeof f.severity === 'string' && (typeof f.criterion === 'string' || typeof f.citation === 'string')
const validEnvelope = (r) =>
    !!r &&
    typeof r === 'object' &&
    Array.isArray(r.findings) &&
    r.findings.every(groundedFinding) &&
    (r.reviewer_status === undefined || r.reviewer_status === 'assessed' || r.reviewer_status === 'abstained')

// --- deterministic, id-derived branch names (a re-run reuses the SAME branch + PR) ---
const SPEC = (() => {
    const a = typeof args !== 'undefined' ? args : undefined
    const s = a && typeof a === 'object' ? a.spec : a
    return typeof s === 'string' ? s : undefined
})()
const RUNTIME = typeof args !== 'undefined'
if (RUNTIME && !/^SPEC-\d+/i.test(String(SPEC))) throw new Error(`execute-spec: pass args: { spec: "SPEC-NNN" } (got ${JSON.stringify(SPEC)})`)
const INTEGRATION_BRANCH = RUNTIME ? `feat/${SPEC}` : undefined
const MAX_FIX_ROUNDS = 3
const branchFor = (task) => `claude/${SPEC}-${task && typeof task === 'object' ? task.id : task}`

// --- pure topo wave builder (cycle-detecting) ---
const buildWaves = (tasks) => {
    const wave = {}
    const compute = (id, stack) => {
        if (wave[id] !== undefined) return wave[id]
        if (stack.has(id)) throw new Error(`task_graph_cycle at ${id}`)
        stack.add(id)
        const deps = dependsOf(tasks[id] || {})
        const w = deps.length
            ? Math.max(
                  ...deps.map((d) => {
                      if (!(d in tasks)) throw new Error(`unknown_dependency ${d} (from ${id})`)
                      return compute(d, stack)
                  })
              ) + 1
            : 0
        stack.delete(id)
        wave[id] = w
        return w
    }
    Object.keys(tasks).forEach((id) => compute(id, new Set()))
    const maxW = Math.max(0, ...Object.values(wave))
    const waves = Array.from({ length: maxW + 1 }, () => [])
    Object.keys(tasks).forEach((id) => waves[wave[id]].push(id))
    return waves.map((w) => w.sort())
}

// --- pure result constructors ---
const accepted = (exec, round, findings) => ({ ...exec, status: 'accepted', round, findings })
const escalatedR = (exec, findings, why) => ({ ...exec, status: 'escalate', findings, notes: why })
const failedR = (exec, why) => ({ ...exec, status: 'failed', notes: why })
const skippedR = (task, reason) => ({ taskId: task.id, status: 'skipped', reason })
const blockedR = (task, deps) => ({ taskId: task.id, status: 'escalate', notes: `blocked: dependencies not accepted: ${deps.join(', ')}` })
const doneTaskIds = (tasks) => new Set(Object.values(tasks).filter(isDone).map((t) => t.id))

// true iff a fix touched a file no blocking finding named (then a scoped re-review is unsafe).
const fixTouchedOutsideScope = (exec, blocking) => {
    const touched = (exec && Array.isArray(exec.files) ? exec.files : []).filter((f) => typeof f === 'string')
    // findings carry `location` as file:line; strip the line so it can match a bare touched path.
    const inScope = new Set(
        (Array.isArray(blocking) ? blocking : [])
            .map((f) => f && (f.location || f.file))
            .filter((f) => typeof f === 'string')
            .map((loc) => loc.split(':')[0])
    )
    return touched.some((f) => !inScope.has(f))
}

// ----------------------------------------------------------------------------
// SCHEMAS — typed handoff contracts (validated at the tool-call layer).
// ----------------------------------------------------------------------------
const EXEC_RESULT = {
    type: 'object',
    required: ['taskId', 'status'],
    properties: {
        taskId: { type: 'string' },
        branch: { type: 'string' },
        prUrl: { type: 'string' },
        status: { enum: ['done', 'failed'] },
        files: { type: 'array', items: { type: 'string' } },
        notes: { type: 'string' }
    }
}
const ENVELOPE = {
    type: 'object',
    required: ['findings'],
    additionalProperties: true,
    properties: {
        reviewer_status: { enum: ['assessed', 'abstained'] },
        findings: {
            type: 'array',
            items: {
                type: 'object',
                required: ['severity'],
                anyOf: [{ required: ['criterion'] }, { required: ['citation'] }],
                additionalProperties: true,
                properties: {
                    severity: { enum: ['blocker', 'major', 'nit', 'suggestion'] },
                    criterion: { type: 'string' },
                    citation: { type: 'string' },
                    location: { type: 'string' },
                    finding: { type: 'string' },
                    suggested_fix: { type: ['string', 'null'] },
                    lens: { type: 'string' },
                    altitude: { enum: ['design', 'implementation'] }
                }
            }
        },
        verification: { type: ['object', 'null'] }
    }
}
const EVIDENCE = {
    type: 'object',
    required: ['built', 'testsPassed', 'commands'],
    properties: {
        built: { type: 'boolean' },
        testsPassed: { type: 'boolean' },
        commands: { type: 'array', items: { type: 'object', required: ['cmd', 'exit'], properties: { cmd: { type: 'string' }, exit: { type: 'integer' }, tail: { type: 'string' } } } },
        artifacts: { type: 'array', items: { type: 'string' } }
    }
}
const PLAN = {
    type: 'object',
    required: ['tasks', 'constraints', 'baseLenses'],
    properties: {
        tasks: { type: 'object' }, // id -> { id, workspace, touches[], tier?, risk?, routing?, depends_on[], status, acceptance_criteria[] }
        constraints: { type: 'array' },
        baseLenses: { type: 'object' }
    }
}
const MERGE_RESULT = {
    type: 'object',
    required: ['merged', 'conflicts'],
    properties: {
        merged: { type: 'array', items: { type: 'string' } },
        conflicts: { type: 'array', items: { type: 'object', required: ['taskId'], properties: { taskId: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } } } } }
    }
}

// ----------------------------------------------------------------------------
// EFFECTS AT THE EDGES — thin agent() wrappers, the only impure surface.
// ----------------------------------------------------------------------------

const ensureIntegrationBranch = () =>
    agent(
        `Ensure the integration branch ${INTEGRATION_BRANCH} exists for ${SPEC}: if absent, create it from origin/main and push it. All task PRs target this branch, NEVER main. Return the branch name.`,
        { phase: 'Build', label: `setup:${INTEGRATION_BRANCH}` }
    )

const runExecutor = (task, fixFindings) => {
    const cfg = wsOf(task)
    const branch = branchFor(task)
    return agent(
        [
            `Implement ${task.id} of ${SPEC} (workspace: ${task.workspace}) against its acceptance criteria. Read the task file specs/tasks/${SPEC}/${task.id}-*.md and the parent spec.`,
            cfg.domainSkill ? `Apply the domain skill \`${cfg.domainSkill}\` for this workspace's idioms and constraints.` : '',
            `Use the deterministic task branch \`${branch}\` (a pure function of the task id — do NOT derive a name from your diff). In your isolated worktree, base it on the CURRENT integration tip and target that branch:\n` +
                `    git fetch origin ${INTEGRATION_BRANCH}\n` +
                `    git checkout -B ${branch} origin/${INTEGRATION_BRANCH}\n` +
                `If \`${branch}\` already exists (a re-run/fix), reuse + force-update it (\`git push --force-with-lease\`) so the EXISTING PR updates instead of opening a duplicate. Never \`git init\`/\`--orphan\`.`,
            `Stay within the task's declared \`touches\` globs. Open / update its PR targeting ${INTEGRATION_BRANCH} (NOT main). Populate each acceptance criterion's \`evidence:\` in the task file before opening the PR.`,
            fixFindings ? `This is a FIX round. Address ONLY these blocking findings, then re-push:\n${JSON.stringify(fixFindings, null, 2)}` : '',
            `Return EXEC_RESULT { taskId: "${task.id}", branch: "${branch}", prUrl, status, files[] }.`
        ]
            .filter(Boolean)
            .join('\n\n'),
        { agentType: cfg.execute, isolation: 'worktree', phase: 'Build', label: fixFindings ? `fix:${task.id}` : `exec:${task.id}`, schema: EXEC_RESULT }
    )
}

// Tier-0 — the cheap, attributable per-task gate. Green is REQUIRED before any reviewer runs.
const runTester = (task, exec) => {
    const cfg = wsOf(task)
    return agent(
        [
            `Run ONLY the cheap Tier-0 gate against branch ${exec.branch} for ${task.id} (workspace: ${task.workspace}). Run, in order, capturing real output:`,
            cfg.tier0.map((c) => `    ${c}`).join('\n'),
            `Do NOT run the expensive end-to-end verification here — that is the integration step. This gate exists to attribute a breakage to ${task.id}.`,
            `Return EXEC_RESULT with status=done ONLY if every command above is green; otherwise status=failed with the failure tail in notes.`
        ].join('\n\n'),
        { agentType: cfg.verify, phase: 'Build', label: `tier0:${task.id}`, schema: EXEC_RESULT }
    )
}

const runReviewer = (reviewerAgent, lenses, checks, task, exec, prior) =>
    agent(
        [
            `Independently review PR ${exec.prUrl} (${task.id} of ${SPEC}) per .ai/skills/review-primitives.md. Read the PR diff and the task file's acceptance criteria.`,
            `Grade through EACH of these lenses IN SEQUENCE — do not blur them; attribute every finding's \`lens\`:`,
            lenses
                .map((l) => {
                    const cs = (checks[l] || []).map((c) => `      - [${c.id}] (${c.severity}) ${c.check} — cite: ${c.cite}`).join('\n')
                    return `  - "${l}"` + (cs ? `\n${cs}` : '')
                })
                .join('\n'),
            `Set \`altitude\` on every finding: "design" if no code edit can satisfy it (the spec/plan is wrong), else "implementation".`,
            `Verify EVIDENCE: a claim asserted without captured command output is a blocker. Populate the \`verification\` block.`,
            prior ? `Prior round's unresolved blocking findings (verify fixed; carry forward unchanged ones, don't re-derive):\n${JSON.stringify(prior, null, 2)}` : '',
            `Emit ONLY the findings ENVELOPE (.ai/skills/review-envelope.schema.json).`
        ]
            .filter(Boolean)
            .join('\n\n'),
        { agentType: reviewerAgent, phase: 'Build', label: `review:${reviewerAgent}:${task.id}`, schema: ENVELOPE }
    )

// one review pass: the generic lenses fold into ONE task-reviewer; each special agent gets its own.
const reviewPass = async (cfg, constraints, task, exec, prior, restrictLenses) => {
    const all = lensesForTier(cfg, constraints, task)
    const checks = checksForLens(constraints, task)
    const restrict = restrictLenses && restrictLenses.length ? new Set(restrictLenses) : null
    const lenses = restrict ? all.filter((l) => restrict.has(l)) : all
    if (!lenses.length) return { verdict: 'accept', blocking: [] }

    const generic = lenses.filter((l) => lensToAgent(l) === 'task-reviewer')
    const specialByAgent = groupBy(lenses.filter((l) => lensToAgent(l) !== 'task-reviewer'), lensToAgent)
    const dispatches = []
    if (generic.length) dispatches.push(() => runReviewer('task-reviewer', generic, checks, task, exec, prior))
    for (const ag of Object.keys(specialByAgent)) dispatches.push(() => runReviewer(ag, specialByAgent[ag], checks, task, exec, prior))

    const reviews = (await parallel(dispatches)).filter(Boolean)
    // a malformed/absent envelope from any dispatched reviewer is a contract violation (not a fix round).
    if (reviews.length < dispatches.length || reviews.some((r) => !validEnvelope(r))) return { verdict: 'contract_violation', blocking: [] }
    if (reviews.some((r) => r.reviewer_status === 'abstained')) return { verdict: 'escalate', blocking: [], reason: 'reviewer abstained — could not assess' }
    const findings = reviews.flatMap((r) => r.findings || [])
    // severity->action overrides applied BEFORE the gate fold (review-primitives.md):
    const ungrounded = findings.filter((f) => isBlocking(f) && !ALLOWED_PREFIX.some((p) => critOf(f).startsWith(p)))
    if (ungrounded.length) return { verdict: 'escalate', blocking: ungrounded, reason: 'ungrounded criterion prefix — contract violation' }
    const scopeBlk = findings.filter((f) => f.severity === 'blocker' && critOf(f) === 'task:scope')
    if (scopeBlk.length) return { verdict: 'escalate', blocking: scopeBlk, reason: 'task:scope blocker — re-plan required' }
    const specBlk = findings.filter((f) => f.severity === 'blocker' && critOf(f).startsWith('spec:'))
    if (specBlk.length) return { verdict: 'escalate', blocking: specBlk, reason: 'spec:* blocker — amendment required' }
    const designBlocking = findings.filter((f) => isBlocking(f) && f.altitude === 'design')
    if (designBlocking.length) return { verdict: 'escalate', blocking: designBlocking, reason: 'design-level finding — replan required' }
    return { verdict: gate(findings), blocking: findings.filter(isBlocking) }
}

// Tier-0 gate -> review -> (fix -> recurse) | accept | escalate, capped at MAX_FIX_ROUNDS.
const reviewAndFix = async (cfg, constraints, task, exec, round = 1, prior = null) => {
    const tested = await runTester(task, exec)
    if (!tested || tested.status !== 'done') {
        if (round > MAX_FIX_ROUNDS) return escalatedR(exec, prior, 'Tier-0 red after max fix rounds')
        log(`tier0 RED ${task.id} (round ${round}) — dispatching fix`)
        const fixed = await runExecutor(task, [{ id: 'TIER0', severity: 'blocker', check: 'make the Tier-0 gate green', notes: tested && tested.notes }])
        // a Tier-0 fix changes the diff materially → drop carry-forward; the next review runs full.
        return reviewAndFix(cfg, constraints, task, fixed || exec, round + 1, null)
    }
    const restrict = round > 1 && prior && !fixTouchedOutsideScope(exec, prior) ? uniq(prior.map((f) => f.lens).filter(Boolean)) : undefined
    const { verdict, blocking, reason } = await reviewPass(cfg, constraints, task, exec, prior, restrict)
    if (verdict === 'accept') return accepted(exec, round, blocking)
    if (verdict === 'contract_violation') return escalatedR(exec, [], 'reviewer_contract_violation — malformed/absent reviewer envelope')
    if (verdict === 'escalate') return escalatedR(exec, blocking, reason || 'escalated')
    if (round > MAX_FIX_ROUNDS) return escalatedR(exec, blocking, 'unresolved blocking findings after max fix rounds')
    log(`review fix ${task.id} (round ${round}) — ${blocking.length} blocking`)
    const fixed = await runExecutor(task, blocking)
    return reviewAndFix(cfg, constraints, task, fixed || exec, round + 1, blocking)
}

// the full per-task pipeline; one crash degrades to `failed` (escalation), never sinks the wave.
const buildTask = (constraints) => async (task) => {
    try {
        if (isDone(task)) return skippedR(task, `already ${task.status}`)
        if (isDeferred(task)) return skippedR(task, `routing=${routingOf(task)}`)
        const contract = validateContract(task)
        if (!contract.valid) return failedR({ taskId: task.id }, `contract invalid: ${contract.errors.join('; ')}`)
        const cfg = wsOf(task)
        const exec = await runExecutor(task, null)
        if (!exec || exec.status !== 'done') return failedR(exec || { taskId: task.id }, 'executor did not complete')
        return reviewAndFix(cfg, constraints, task, exec)
    } catch (e) {
        const msg = e && e.message ? e.message : String(e)
        log(`CRASH ${task.id} (surfaced, not swallowed): ${msg}`)
        return failedR({ taskId: task.id }, `crashed: ${msg}`)
    }
}

// merge a wave's accepted task branches into the integration branch, in id order, then update
// each merged task's status to `done` in _index.yaml (so a restart's planner skips it).
const mergeAccepted = (toMerge) =>
    agent(
        [
            `In the orchestrator checkout (NOT a task worktree), fold these accepted ${SPEC} task branches into ${INTEGRATION_BRANCH}, in THIS order:`,
            toMerge.map((m, i) => `  ${i + 1}. ${branchFor(m.taskId)}  (${m.taskId})`).join('\n'),
            `RECONCILE FIRST (crash recovery): \`git fetch origin ${INTEGRATION_BRANCH}\`; for any listed branch already contained in ${INTEGRATION_BRANCH} (a prior run merged it) whose task still reads status:pending, set its status:done and treat it as merged — do NOT re-merge it.`,
            `For each remaining branch, in order: \`git fetch origin ${INTEGRATION_BRANCH} <branch>\`; \`git checkout ${INTEGRATION_BRANCH} && git reset --hard origin/${INTEGRATION_BRANCH}\`; \`git merge --no-ff --no-edit origin/<branch>\`; then in the SAME commit set that task's \`status: done\` in specs/tasks/${SPEC}/_index.yaml and its task file; then \`git push origin ${INTEGRATION_BRANCH}\` — **per branch** (merge+status+push together), so a crash between branches leaves a consistent index that a restart can reconcile.`,
            `If ANY merge conflicts: \`git merge --abort\`, STOP (do not merge later branches), do NOT hand-resolve — a conflict means the decomposition's file-scoping (touches) was wrong. Record it in \`conflicts\` and every skipped later branch too.`,
            `Return MERGE_RESULT { merged: [taskId...], conflicts: [{ taskId, paths[] }] }.`
        ].join('\n\n'),
        { phase: 'Build', label: `merge:${INTEGRATION_BRANCH}`, schema: MERGE_RESULT }
    )

const acceptMergeOrder = (built) =>
    (Array.isArray(built) ? built : [])
        .filter((r) => r && r.status === 'accepted' && r.taskId)
        .map((r) => ({ taskId: r.taskId }))
        .sort((a, b) => (a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))

// integration: run the expensive verification (the end-to-end proof, captured as EVIDENCE),
// then an independent review against the spec's success criteria, then open the PR.
const runIntegrationVerify = (workspaces) => {
    const verifiers = uniq(workspaces.map((w) => (WORKSPACES[w] || WORKSPACES._default).expensiveVerify).filter(Boolean))
    // NOTE: with no workspace declaring an `expensiveVerify` (the shipped `_default`), the integration
    // EVIDENCE gate is vacuously green — there is no end-to-end proof beyond the per-task Tier-0 gates.
    // Set `expensiveVerify` on a workspace to require real integration evidence (e.g. an e2e run).
    if (!verifiers.length) return Promise.resolve({ built: true, testsPassed: true, commands: [], artifacts: [] })
    return agent(
        [
            `Check out ${INTEGRATION_BRANCH} for ${SPEC} (all accepted task branches are merged in).`,
            `Run the expensive end-to-end verification (${verifiers.join(', ')}) and capture EVIDENCE: build, full tests, and any end-to-end run; capture artifacts (screenshots, reports) of each acceptance-criteria surface.`,
            `Surface real command output — never assert success without it. Return EVIDENCE { built, testsPassed, artifacts[], commands[] }.`
        ].join('\n\n'),
        { agentType: 'tester', phase: 'Integrate', label: `verify:${INTEGRATION_BRANCH}`, schema: EVIDENCE }
    )
}

const openIntegrationPR = (evidence, taskVerdicts) =>
    agent(
        [
            `Open the integration PR ${INTEGRATION_BRANCH} -> main for ${SPEC}. Body MUST carry: the spec link; the per-task verdicts (${JSON.stringify(taskVerdicts)}); and a Testing Evidence section with the captured EVIDENCE (command output + artifacts).`,
            `Evidence:\n${JSON.stringify(evidence, null, 2)}`,
            `Do NOT merge (a human merges to main). Return { prUrl }.`
        ].join('\n\n'),
        { phase: 'Integrate', label: `pr:${INTEGRATION_BRANCH}` }
    )

const runIntegrationReview = (prUrl, evidence, integConstraints) =>
    agent(
        [
            `Independently review the integration PR ${prUrl} for ${SPEC} per .ai/skills/review-primitives.md. You did NOT author this work.`,
            `Grade against the spec's SUCCESS CRITERIA (read specs/${SPEC}-*.md), beyond any single task's ACs.`,
            integConstraints.length ? `Enforce these integration-scope constraints and CITE each:\n${integConstraints.map((c) => `  - [${c.id}] (${c.severity}) ${c.check}`).join('\n')}` : '',
            `Verify the EVIDENCE substantiates the claims (build/tests green, artifacts present). Evidence without output is a blocker.\n${JSON.stringify(evidence, null, 2)}`,
            `Emit ONLY the findings ENVELOPE.`
        ]
            .filter(Boolean)
            .join('\n\n'),
        { agentType: 'integration-reviewer', phase: 'Integrate', label: `review:${INTEGRATION_BRANCH}`, schema: ENVELOPE }
    )

// ----------------------------------------------------------------------------
// RUN — the impure top-level body (only under the workflow runtime).
// ----------------------------------------------------------------------------
async function run() {
    phase('Plan')
    const plan = await agent(
        `Read specs/tasks/${SPEC}/_index.yaml and every specs/tasks/${SPEC}/TASK-*.md, plus .ai/skills/review-constraints.yaml. Return PLAN: ` +
            `tasks (a map id -> { id, workspace, touches (flat string[] of globs verbatim), tier (or null), risk (or null), routing (claude-code|human, or null), depends_on (ids, or {id,ordering_only,reason} objects), status, acceptance_criteria (ids) }); ` +
            `constraints (the parsed review-constraints.yaml \`constraints:\` list verbatim); and baseLenses (the parsed \`baseLenses:\` map).`,
        { schema: PLAN, label: `plan:${SPEC}` }
    )
    const { tasks, constraints } = plan
    const cfg = { baseLenses: plan.baseLenses }
    const waves = buildWaves(tasks) // pure topo; throws task_graph_cycle on a cycle

    phase('Build')
    await ensureIntegrationBranch()
    const { results } = await waves.reduce(
        async (accP, wave) => {
            const { results, accepted: acc } = await accP
            const built = (
                await parallel(
                    wave.map((id) => () => {
                        const task = tasks[id]
                        const unmet = dependsOf(task).filter((d) => !acc.has(d))
                        return unmet.length ? Promise.resolve(blockedR(task, unmet)) : buildTask(constraints)({ ...task, id })
                    })
                )
            ).filter(Boolean)
            // fold this wave's accepted branches into the integration branch BEFORE the next wave,
            // so a dependent branches off a tip carrying its dependencies. A conflict => escalate.
            const toMerge = acceptMergeOrder(built)
            const conflicted = new Set()
            if (toMerge.length) {
                const merge = await mergeAccepted(toMerge)
                const ok = new Set((merge && merge.merged) || [])
                toMerge.forEach((m) => !ok.has(m.taskId) && conflicted.add(m.taskId))
            }
            const settled = built.map((r) =>
                r.status === 'accepted' && conflicted.has(r.taskId)
                    ? { ...r, status: 'escalate', notes: `merge into ${INTEGRATION_BRANCH} conflicted — decomposition file-scoping (touches) was wrong` }
                    : r
            )
            const nextAcc = new Set(acc)
            settled.forEach((r) => r.status === 'accepted' && nextAcc.add(r.taskId))
            return { results: [...results, ...settled], accepted: nextAcc }
        },
        Promise.resolve({ results: [], accepted: doneTaskIds(tasks) })
    )

    const escalations = results.filter((r) => r.status === 'escalate' || r.status === 'failed')
    if (escalations.length) {
        log(`HALT: ${escalations.length} task(s) need a human — ${escalations.map((r) => r.taskId).join(', ')}`)
        return { spec: SPEC, results, escalations }
    }

    // only integrate when nothing executable remains (a pending human task blocks integration).
    const all = Object.values(tasks)
    const acceptedThisRun = new Set(results.filter((r) => r.status === 'accepted').map((r) => r.taskId))
    const remaining = all.filter((t) => !isDone(t) && !isDeferred(t) && !acceptedThisRun.has(t.id))
    const humanPending = all.filter((t) => isDeferred(t) && !isDone(t))
    if (remaining.length || humanPending.length) {
        log(`Integration skipped — tasks remain. pending=[${remaining.map((t) => t.id)}] human=[${humanPending.map((t) => t.id)}]`)
        return { spec: SPEC, results, integration: 'skipped: tasks remain' }
    }

    phase('Integrate')
    const workspaces = uniq(all.map((t) => t.workspace))
    const evidence = await runIntegrationVerify(workspaces)
    const evidenceGreen = !!evidence && evidence.built === true && evidence.testsPassed === true
    if (!evidenceGreen) {
        log(`HALT: integration EVIDENCE not green on ${INTEGRATION_BRANCH}`)
        return { spec: SPEC, results, integration: 'evidence-red', evidence }
    }
    const integConstraints = integrationConstraintsFor(constraints, workspaces)
    const taskVerdicts = results.map((r) => ({ task: r.taskId, status: r.status }))
    const { prUrl } = await openIntegrationPR(evidence, taskVerdicts)
    const integrationReview = await runIntegrationReview(prUrl, evidence, integConstraints)
    // NOTE: unlike per-task reviewPass, the integration gate intentionally collapses ALL blocking
    // findings to "not ready" (it does not separately escalate task:scope / spec:* / design-altitude).
    // The integration PR awaits a human merge regardless, so a human sees any blocking finding directly.
    // same guard as per-task reviewPass: a malformed or abstained integration review is NOT an accept.
    const reviewOk = validEnvelope(integrationReview) && integrationReview.reviewer_status !== 'abstained'
    const readyToMerge = reviewOk && gate((integrationReview && integrationReview.findings) || []) === 'accept'
    log(readyToMerge ? `Integration PR ${prUrl} PASSED — READY FOR HUMAN MERGE to main.` : `Integration PR ${prUrl} not ready (blocking findings / abstain / malformed review) — escalating.`)
    return { spec: SPEC, results, integrationPR: prUrl, evidence, integrationReview, readyToMerge }
}

if (RUNTIME) return await run()
