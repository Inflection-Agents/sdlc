// The registry's `when.touches` globs, read without a YAML parser.
//
// It lives in lib/ because reviewer-routing.mjs and the write-time hook need it, and lib/
// always ships whole with the plugin. A repo may keep a locally edited
// check-review-constraint-globs.mjs, so a framework file must not import from it.

/**
 * Parse `{ id, touches[] }` rows out of the registry text. Handles both the inline
 * flow form (`when: { touches: ["a/**", "b/**"] }`) and the block form
 * (`when:` / `  touches:` / `    - a/**`). Returns [] on anything unreadable.
 */
export function parseRegistryTouches(text) {
    // Normalize CRLF: the row regexes below end `$` without the `m` flag, so on a Windows
    // checkout not one line matches and every row parses to zero globs - which enrich()
    // then hands to the write-time hook as an empty touches list.
    const lines = String(text).replace(/\r\n?/g, '\n').split('\n')
    const rows = []
    let current = null
    let inTouchesBlock = false
    let inFlowList = false
    // Indent of an open block scalar (`check: >` / `check: |`). Its lines are PROSE.
    // Without this, a check paragraph containing a line like `- id: SOMETHING` forks a
    // phantom row that steals the real row's globs — which would then be reported as
    // "no globs read" while its dead glob is attributed to a constraint that does not
    // exist. Same defect this checker exists to catch, one level up.
    let blockIndent = null
    const indentOf = (l) => l.match(/^(\s*)/)[1].length
    const pushLiterals = (s, target) => {
        for (const m of String(s).matchAll(/["']([^"']+)["']/g)) target.push(m[1])
    }
    for (const line of lines) {
        if (blockIndent !== null) {
            if (line.trim() === '' || indentOf(line) > blockIndent) continue
            blockIndent = null
        }
        const opensBlock = line.match(/^\s*[a-z_]+\s*:\s*[>|]/i)
        if (opensBlock) {
            blockIndent = indentOf(line)
            continue
        }
        const item = line.match(/^\s*-\s*id\s*:\s*(.+)$/)
        if (item) {
            if (current) rows.push(current)
            current = { id: item[1].trim().replace(/^["']|["']$/g, ''), touches: [] }
            inTouchesBlock = false
            inFlowList = false
            continue
        }
        if (!current) continue
        const flow = line.match(/^\s*when\s*:\s*\{(.*)\}\s*$/)
        if (flow) {
            const t = flow[1].match(/touches\s*:\s*\[([^\]]*)\]/)
            if (t) pushLiterals(t[1], current.touches)
            inTouchesBlock = false
            continue
        }
        const inlineList = line.match(/^\s*touches\s*:\s*\[([^\]]*)\]\s*$/)
        if (inlineList) {
            pushLiterals(inlineList[1], current.touches)
            inTouchesBlock = false
            continue
        }
        // A flow list that spans lines (`touches: [` … `]`). Without this the row
        // parses to zero globs and is silently dropped — under-reporting coverage is
        // the same defect class this checker exists to catch.
        const openFlow = line.match(/^\s*touches\s*:\s*\[(.*)$/)
        if (openFlow) {
            pushLiterals(openFlow[1], current.touches)
            inTouchesBlock = false
            inFlowList = !/\]/.test(openFlow[1])
            continue
        }
        if (inFlowList) {
            pushLiterals(line, current.touches)
            if (/\]/.test(line)) inFlowList = false
            continue
        }
        if (/^\s*touches\s*:\s*$/.test(line)) {
            inTouchesBlock = true
            continue
        }
        if (inTouchesBlock) {
            // A bare `touches:` may be followed by `- item` lines OR by a flow list
            // whose opening bracket sits on the next line.
            if (line.trim().startsWith('[')) {
                pushLiterals(line, current.touches)
                inFlowList = !/\]/.test(line)
                inTouchesBlock = false
                continue
            }
            const entry = line.match(/^\s*-\s*(.+)$/)
            if (entry) {
                current.touches.push(entry[1].trim().replace(/^["']|["']$/g, ''))
                continue
            }
            inTouchesBlock = false
        }
    }
    if (current) rows.push(current)
    return rows
}
