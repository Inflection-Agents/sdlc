// Fenced-code tracking for the spec checks. A fence closes only on a line of the same character
// at least as long as its opener, so a ``` line inside a ~~~ block does not close it (CommonMark).

const OPEN = /^\s{0,3}(`{3,}|~{3,})/

/** A function that takes each line in order and returns whether that line is a fence or inside one. */
export function fenceTracker() {
    let opener = null
    return (line) => {
        const m = String(line).match(OPEN)
        if (!opener) {
            if (m) opener = m[1]
            return Boolean(m)
        }
        if (m && m[1][0] === opener[0] && m[1].length >= opener.length && /^\s*[`~]+\s*$/.test(line)) opener = null
        return true
    }
}

/** Whether a line opens or closes a fence. */
export const isFenceLine = (line) => OPEN.test(String(line))
