# Skyline Technology Solutions — Customer MOPs

Method-of-Procedure documents Skyline produces for its managed networks.
End customer for the ASR9904 work below: **Howard County Broadband Network (HCBN)**
(Howard County Office of Broadband).

## Contents

| Path | What |
|------|------|
| `mops/HCBN-ASR9904-IOSXR-25.2.2-Upgrade-MOP-v1.docx` | Cisco ASR9904 IOS XR upgrade **24.3.2 → 25.2.2** for POD- and LIGON-ASR9904-W-01 |
| `build/gen-asr9904-iosxr-25.2.2.js` | Generator for that MOP (parametrized — see Reusability) |
| `assets/skyline-logo.png` | Skyline logo used in the document footer |

## MOP design notes

- **Template lineage:** follows the Skyline/Element Critical MOP layout (approval block,
  participants, references, risks, indicator legend, Step/Location/Equipment/Indicator/
  Action/Init procedure tables, revision + approval), branded for Skyline (logo footer +
  page numbers).
- **Validated direct path:** the 24.3.2 → 25.2.2 upgrade was validated on both routers
  (`show install upgrade-matrix ... from-running`, 2026-08-06) — **no Bridge SMUs, no
  caveats** — so the MOP is a single-step install (add → prepare → activate → commit).
- **Traffic-migration flow:** the pair is upgraded in one window using Haseeb's LIGON⇄POD
  migration script — park production on POD → upgrade LIGON → move back to LIGON (idles
  POD) → upgrade POD → restore standard state.
- **Execution caveat:** before running, reconcile the `Bundle-Ether200` subinterface list to
  services **still in production on the ASRs** (some were moved to the MX platform).

## Regenerate

```bash
cd build
npm install docx          # first time only (LibreOffice/pandoc not required to generate)
node gen-asr9904-iosxr-25.2.2.js
```

## Reusability — the next upgrade (e.g. 25.2.2 → a later release)

Copy the generator, then in its `CFG` block update `currentVersion`, `targetVersion`, and
`iso`. Before running the real change: (1) re-run the upgrade-path validation (MOP Step P-4)
with the new `.iso` to confirm the direct path and any Bridge SMUs/caveats; (2) confirm the
package/RPM set and MD5s against that release's Cisco ASR 9000 release notes; then regenerate.

## Sources

- IOS XR 25.2.2 Upgrade Path Validation for the ASRs (email, 2026-08-06) — direct-path confirmation.
- HCG ASR9904 Traffic Migration Script, Summary Version (Haseeb Hameed).
- ASR9904 IOS XR Upgrade MOP v2 (prior 24.3.2 upgrade) — install-process reference.
- Cisco ASR 9000 IOS XR 25.2.2 Release Notes: https://www.cisco.com/c/en/us/td/docs/routers/iosxr/release-notes/25xx/cisco-asr-9000-series-routers-release-notes-2522.html
