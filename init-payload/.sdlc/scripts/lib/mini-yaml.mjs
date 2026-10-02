/**
 * A YAML subset parser and emitter for the framework's own config files.
 *
 * The framework ships with no dependencies, because an adopter's CI runs these scripts
 * with a bare `node`. The files it reads (`.sdlc/config.yaml`, the state machine) use a
 * small, regular subset: block maps, block sequences, maps inside sequences, quoted and
 * plain scalars, and flow collections of scalars (`[a, b]`, `{}`). Anchors, tags,
 * multi-document streams and block scalars (`|`, `>`) are not supported, and a line this
 * parser cannot place throws rather than being skipped, because a config read wrongly
 * changes which gates run.
 */

/** Strip a trailing comment that sits outside quotes. */
function stripComment(line) {
    let quote = null
    for (let i = 0; i < line.length; i += 1) {
        const ch = line[i]
        if (quote) {
            if (ch === quote) {
                if (quote === "'" && line[i + 1] === "'") i += 1
                else quote = null
            } else if (ch === '\\' && quote === '"') i += 1
        } else if (ch === "'" || ch === '"') {
            quote = ch
        } else if (ch === '#' && (i === 0 || /\s/.test(line[i - 1]))) {
            return line.slice(0, i).trimEnd()
        }
    }
    return line.trimEnd()
}

function toLines(text) {
    const out = []
    text.split(/\r?\n/).forEach((raw, n) => {
        if (/^\s*#/.test(raw) || raw.trim() === '' || raw.trim() === '---') return
        const content = stripComment(raw)
        if (content.trim() === '') return
        if (/^\t/.test(content)) throw new Error(`line ${n + 1}: tab indentation is not supported`)
        const indent = content.length - content.trimStart().length
        out.push({ indent, text: content.trim(), n: n + 1 })
    })
    return out
}

/** Split a flow collection body on commas that sit outside quotes. */
function splitFlow(body) {
    const parts = []
    let quote = null
    let cur = ''
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i]
        if (quote) {
            cur += ch
            if (ch === quote) quote = null
        } else if (ch === "'" || ch === '"') {
            quote = ch
            cur += ch
        } else if (ch === ',') {
            parts.push(cur.trim())
            cur = ''
        } else cur += ch
    }
    if (cur.trim() !== '') parts.push(cur.trim())
    return parts
}

export function parseScalar(raw) {
    const s = raw.trim()
    if (s === '' || s === '~' || s === 'null') return null
    if (s.startsWith("'")) {
        if (!s.endsWith("'") || s.length < 2) throw new Error(`unterminated single-quoted scalar: ${s}`)
        return s.slice(1, -1).replace(/''/g, "'")
    }
    if (s.startsWith('"')) {
        if (!s.endsWith('"') || s.length < 2) throw new Error(`unterminated double-quoted scalar: ${s}`)
        return s
            .slice(1, -1)
            .replace(/\\(["\\nrt])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' })[c])
    }
    if (s.startsWith('[')) {
        if (!s.endsWith(']')) throw new Error(`unterminated flow sequence: ${s}`)
        return splitFlow(s.slice(1, -1)).map(parseScalar)
    }
    if (s.startsWith('{')) {
        if (!s.endsWith('}')) throw new Error(`unterminated flow mapping: ${s}`)
        const map = {}
        for (const part of splitFlow(s.slice(1, -1))) {
            const m = part.match(/^([^:]+):\s*(.*)$/)
            if (!m) throw new Error(`unparseable flow mapping entry: ${part}`)
            map[parseScalar(m[1])] = parseScalar(m[2])
        }
        return map
    }
    if (s === 'true') return true
    if (s === 'false') return false
    if (/^-?\d+$/.test(s)) return Number(s)
    return s
}

/** `key: value` or `key:` with the key possibly quoted. Returns null when the text is not a map entry. */
function splitKey(text) {
    const m = text.match(/^('(?:[^']|'')*'|"(?:[^"\\]|\\.)*"|[^\s'"][^:]*?)\s*:(?:\s+(.*))?$/)
    if (!m) return null
    return { key: parseScalar(m[1]), rest: m[2] ?? '' }
}

function parseBlock(lines, i, indent) {
    const line = lines[i]
    if (line.text === '-' || line.text.startsWith('- ')) return parseSeq(lines, i, line.indent)
    if (splitKey(line.text)) return parseMap(lines, i, line.indent)
    return [parseScalar(line.text), i + 1]
}

function parseValue(lines, i, parentIndent, rest) {
    if (rest !== '') return [parseScalar(rest), i]
    const next = lines[i]
    if (!next) return [null, i]
    if (next.indent > parentIndent) return parseBlock(lines, i, next.indent)
    if (next.indent === parentIndent && (next.text === '-' || next.text.startsWith('- '))) {
        return parseSeq(lines, i, parentIndent)
    }
    return [null, i]
}

function parseMap(lines, i, indent) {
    const map = {}
    while (i < lines.length && lines[i].indent === indent) {
        const line = lines[i]
        if (line.text === '-' || line.text.startsWith('- ')) break
        const kv = splitKey(line.text)
        if (!kv) throw new Error(`line ${line.n}: expected "key: value", got "${line.text}"`)
        const [value, next] = parseValue(lines, i + 1, indent, kv.rest)
        map[kv.key] = value
        i = next
    }
    if (i < lines.length && lines[i].indent > indent) {
        throw new Error(`line ${lines[i].n}: unexpected indentation`)
    }
    return [map, i]
}

function parseSeq(lines, i, indent) {
    const seq = []
    while (i < lines.length && lines[i].indent === indent && (lines[i].text === '-' || lines[i].text.startsWith('- '))) {
        const line = lines[i]
        const rest = line.text === '-' ? '' : line.text.slice(2).trimStart()
        if (rest === '') {
            const [value, next] = parseValue(lines, i + 1, indent, '')
            seq.push(value)
            i = next
            continue
        }
        if (splitKey(rest) && !/^['"[{]/.test(rest)) {
            const column = indent + (line.text.length - rest.length)
            const virtual = [{ indent: column, text: rest, n: line.n }, ...lines.slice(i + 1)]
            const [value, used] = parseMap(virtual, 0, column)
            seq.push(value)
            i = i + used
            continue
        }
        seq.push(parseScalar(rest))
        i += 1
    }
    return [seq, i]
}

export function parseYaml(text) {
    const lines = toLines(text)
    if (lines.length === 0) return null
    const [value, end] = parseBlock(lines, 0, lines[0].indent)
    if (end < lines.length) throw new Error(`line ${lines[end].n}: content after the document's top level`)
    return value
}

// A plain scalar may not start with a YAML indicator such as @ or `, so those are quoted.
const PLAIN = /^[A-Za-z0-9_./][A-Za-z0-9_./@ -]*$/

function emitScalar(v) {
    if (v === null || v === undefined) return '""'
    if (typeof v === 'boolean' || typeof v === 'number') return String(v)
    const s = String(v)
    // yes, no, on, off, y and n are booleans to a YAML 1.1 reader such as PyYAML.
    const reserved = /^(true|false|null|~|-?\d+|y|n|yes|no|on|off)$/i
    if (s !== '' && PLAIN.test(s) && !reserved.test(s) && !s.endsWith(' ')) return s
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) throw new Error(`cannot write a control character in ${JSON.stringify(s)}`)
    const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    return `"${escaped}"`
}

function isScalarList(v) {
    return Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object')
}

/** Emit a value as block YAML with two-space indentation. Scalar lists are written in flow style. */
export function emitYaml(value, indent = 0) {
    const pad = ' '.repeat(indent)
    if (Array.isArray(value)) {
        if (value.length === 0) return `${pad}[]\n`
        return value
            .map((item) => {
                if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
                    const body = emitYaml(item, indent + 2)
                    return `${pad}- ${body.slice(indent + 2)}`
                }
                return `${pad}- ${emitScalar(item)}\n`
            })
            .join('')
    }
    if (value !== null && typeof value === 'object') {
        return Object.entries(value)
            .map(([k, v]) => {
                if (isScalarList(v)) return `${pad}${k}: [${v.map(emitScalar).join(', ')}]\n`
                if (v !== null && typeof v === 'object') {
                    if (Object.keys(v).length === 0) return `${pad}${k}: {}\n`
                    return `${pad}${k}:\n${emitYaml(v, indent + 2)}`
                }
                return `${pad}${k}: ${emitScalar(v)}\n`
            })
            .join('')
    }
    return `${pad}${emitScalar(value)}\n`
}
