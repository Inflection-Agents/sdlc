/*
 * MOP generator — Cisco ASR9904 IOS XR upgrade for HCBN (Skyline Technology Solutions).
 *
 * REUSABLE: to produce the next single-step upgrade MOP (e.g. 25.2.2 -> a later
 * release), change the constants in CFG below, re-run the upgrade-path validation
 * (Pre-Work step P-4) against the new .iso, confirm packages against that release's
 * ASR 9000 release notes, then regenerate:  node gen-asr9904-iosxr-25.2.2.js
 */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, AlignmentType, ImageRun, Footer, PageNumber,
  VerticalAlign, HeadingLevel, TableLayoutType,
} = require("docx");

// ---------------------------------------------------------------- config
const CFG = {
  customer: "Howard County Broadband Network (HCBN)",
  provider: "Skyline Technology Solutions",
  platform: "Cisco ASR9904",
  currentVersion: "24.3.2",
  targetVersion: "25.2.2",
  iso: "asr9k-mini-x64-25.2.2.iso",
  releaseNotes:
    "https://www.cisco.com/c/en/us/td/docs/routers/iosxr/release-notes/25xx/cisco-asr-9000-series-routers-release-notes-2522.html",
  devices: ["POD-ASR9904-W-01", "LIGON-ASR9904-W-01"],
  asn: "26297",
  validationDate: "2026-08-06",
  revision: "1.0",
  revisionDate: "2026/09/08",
  author: "Andrew Ntuyo",
  logo: path.join(__dirname, "..", "assets", "skyline-logo.png"),
  out: path.join(__dirname, "..", "mops", "HCBN-ASR9904-IOSXR-25.2.2-Upgrade-MOP-v1.docx"),
};

// LIGON <-> POD production bundle subinterfaces (per Haseeb's migration script).
// NOTE: reconcile to services STILL in production on the ASRs before execution
// (some were migrated to the MX platform — per Matt Smith, 2026-09-01).
const SUBIFS = [990,991,992,993,1110,1201,1202,1206,1207,1209,1210,1212,1214,1216,
  1219,1220,1215,1250,1255,1263,1264,1266,1269,1271,1272,1273,1274,1275,1281,1284,
  1286,1288,1310,1311];
const BGP_NEIGHBORS = ["167.102.23.128","167.102.188.62","167.102.188.114","10.196.224.1"];

// ---------------------------------------------------------------- palette
const NAVY = "14365C", GREY = "5A5A5A", LIGHT = "E7ECF2", BAND = "14365C", LINE = "BFBFBF";
const MONO = "Consolas";

// ---------------------------------------------------------------- helpers
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
  insideHorizontal: noBorder, insideVertical: noBorder };
const thin = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const cellBorders = { top: thin, bottom: thin, left: thin, right: thin };

function P(text, o = {}) {
  return new Paragraph({
    spacing: { after: o.after ?? 40, before: o.before ?? 0 },
    alignment: o.align,
    heading: o.heading,
    children: [new TextRun({ text, bold: o.bold, italics: o.italics,
      color: o.color, size: o.size, font: o.font })],
  });
}
// monospace command block: pass a multiline string
function code(str, o = {}) {
  return str.replace(/\n+$/,"").split("\n").map((ln) =>
    new Paragraph({ spacing: { after: 0 },
      children: [new TextRun({ text: ln === "" ? " " : ln, font: MONO, size: 16, color: "1A1A1A" })] }));
}
function note(text) {
  return new Paragraph({ spacing: { before: 40, after: 40 },
    children: [new TextRun({ text: "NOTE: ", bold: true, color: "9C4A00", size: 18 }),
      new TextRun({ text, italics: true, color: "9C4A00", size: 18 })] });
}

function band(text) {
  return new Paragraph({
    spacing: { before: 200, after: 80 }, shading: { type: ShadingType.CLEAR, fill: BAND, color: "auto" },
    children: [new TextRun({ text, bold: true, color: "FFFFFF", size: 24 })],
  });
}
function h2(text) {
  return new Paragraph({ spacing: { before: 160, after: 60 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: NAVY } },
    children: [new TextRun({ text, bold: true, color: NAVY, size: 24 })] });
}

// two-column key/value table
function kv(rows, w1 = 3200, w2 = 6880) {
  return new Table({
    width: { size: w1 + w2, type: WidthType.DXA }, columnWidths: [w1, w2],
    layout: TableLayoutType.FIXED,
    rows: rows.map(([k, v]) => new TableRow({ children: [
      new TableCell({ width: { size: w1, type: WidthType.DXA }, borders: cellBorders,
        shading: { type: ShadingType.CLEAR, fill: LIGHT, color: "auto" },
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        children: [P(k, { bold: true, size: 18, color: NAVY })] }),
      new TableCell({ width: { size: w2, type: WidthType.DXA }, borders: cellBorders,
        margins: { top: 40, bottom: 40, left: 90, right: 90 },
        children: Array.isArray(v) ? v : [P(v, { size: 18 })] }),
    ] })),
  });
}

// operating-procedure step table
const PROC_COLS = [640, 1120, 1360, 1120, 5240, 600]; // sums to 10080
const PROC_HEAD = ["Step", "Location", "Equipment", "Indicator", "Action / Task", "Init"];
function procCell(content, i, opts = {}) {
  const kids = Array.isArray(content) ? content
    : [P(String(content), { size: 18, bold: opts.bold, color: opts.color })];
  return new TableCell({ width: { size: PROC_COLS[i], type: WidthType.DXA }, borders: cellBorders,
    verticalAlign: VerticalAlign.TOP, margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    children: kids });
}
function procTable(rows) {
  const header = new TableRow({ tableHeader: true, children: PROC_HEAD.map((h, i) =>
    procCell([P(h, { bold: true, size: 18, color: "FFFFFF" })], i, { fill: NAVY })) });
  const body = rows.map((r, idx) => new TableRow({ children: [
    procCell(r.step ?? String(idx + 1), 0),
    procCell(r.loc ?? "", 1),
    procCell(r.equip ?? "", 2),
    procCell(r.ind ?? "", 3, { color: r.ind ? "9C4A00" : undefined }),
    procCell(r.action, 4),
    procCell(r.init ?? "", 5),
  ] }));
  return new Table({ width: { size: 10080, type: WidthType.DXA }, columnWidths: PROC_COLS,
    layout: TableLayoutType.FIXED, rows: [header, ...body] });
}

// action-cell content builders
const aP = (t, o = {}) => P(t, { size: 18, ...o });
const aBold = (t) => P(t, { size: 18, bold: true, color: NAVY });

// ---------------------------------------------------------------- baseline set
const BASELINE = `show platform
show platform vm
show redundancy
show install active
admin show install active
show install committed
show version
cfs check
show hw-module fpd
show pfm location all
show alarm
admin show environment all
admin show led
show media
show inventory
show logging last 200
show bgp summary
show bgp ipv4 unicast summary
show ospf neighbor
show route summary
show interfaces description
show interfaces Bundle-Ether200 brief
show vrrp brief`;

// migration script blocks
const MIG_OFF_LIGON = `configure terminal
 interface Bundle-Ether200
  shutdown
 router bgp ${CFG.asn}
${BGP_NEIGHBORS.map((n) => `  neighbor ${n}\n   shutdown`).join("\n")}
 commit
end`;
const MIG_ON_POD = `configure terminal
${SUBIFS.map((s) => ` interface Bundle-Ether200.${s}\n  no shutdown`).join("\n")}
 commit
end`;
const MIG_OFF_POD = `configure terminal
${SUBIFS.map((s) => ` interface Bundle-Ether200.${s}\n  shutdown`).join("\n")}
 commit
end`;
const MIG_ON_LIGON = `configure terminal
 interface Bundle-Ether200
  no shutdown
 router bgp ${CFG.asn}
${BGP_NEIGHBORS.map((n) => `  neighbor ${n}\n   no shutdown`).join("\n")}
 commit
end`;
const MIG_VERIFY = `show bgp summary
show interfaces Bundle-Ether200 brief
show ospf neighbor
show route <customer-prefix> detail
show vrrp brief`;

// reusable per-router upgrade steps (returns array of proc rows)
function upgradeRows(dev, prefix) {
  return [
    { step: `${prefix}-1`, loc: "Remote", equip: dev, action: [
      aBold("Add the target image (and any required feature RPMs per the release notes)"),
      ...code(`install add source harddisk:/ ${CFG.iso}`) ] },
    { step: `${prefix}-2`, loc: "Remote", equip: dev, ind: "Stop & validate", action: [
      aP("Retrieve the operation ID; wait for the add to complete:"), ...code("show install request") ] },
    { step: `${prefix}-3`, loc: "Remote", equip: dev, action: [
      aP("Prepare the packages to be activated:"), ...code("install prepare id <ID from previous step>") ] },
    { step: `${prefix}-4`, loc: "Remote", equip: dev, ind: "Change of state", action: [
      aBold("Activate — the router reloads (~25–30 min):"), ...code("install activate id <ID>"),
      note("Monitor the reload via the console/OOB path. Do not disconnect.") ] },
    { step: `${prefix}-5`, loc: "Remote", equip: dev, ind: "Stop & validate", action: [
      aBold(`Verify the router came back on ${CFG.targetVersion}:`),
      ...code(`show version\nshow platform\nshow install active\nshow redundancy\nshow configuration failed startup`),
      aP(`Expected: Version ${CFG.targetVersion}; all nodes/RSPs IOS XR RUN; redundancy ready; no failed config.`) ] },
    { step: `${prefix}-6`, loc: "Remote", equip: dev, ind: "Important note", action: [
      aP("Check FPDs; upgrade if any are not CURRENT, then reload the affected location if prompted:"),
      ...code("show hw-module fpd\nupgrade hw-module fpd all location all") ] },
    { step: `${prefix}-7`, loc: "Remote", equip: dev, ind: "Important note", action: [
      aBold("Commit the software:"), ...code("install commit"),
      note(`If install commit is NOT run, a reload reverts the router to ${CFG.currentVersion}.`) ] },
    { step: `${prefix}-8`, loc: "Remote", equip: dev, action: [
      aP("Remove inactive packages:"), ...code("install remove inactive all") ] },
    { step: `${prefix}-9`, loc: "Remote", equip: dev, ind: "Stop & validate", action: [
      aBold("Collect POST baselines and COMPARE to the pre-upgrade capture (Step P-7):"), ...code(BASELINE),
      aP("Expected: BGP/OSPF neighbors re-established, route counts within range, no new alarms, interfaces as before.") ] },
  ];
}

// ---------------------------------------------------------------- sections
const children = [];

// title
children.push(new Paragraph({ spacing: { after: 40 }, children: [
  new TextRun({ text: "Method of Procedure (MOP)", bold: true, color: NAVY, size: 40 }) ] }));
children.push(new Paragraph({ spacing: { after: 120 }, children: [
  new TextRun({ text: `${CFG.platform} — IOS XR Upgrade ${CFG.currentVersion} → ${CFG.targetVersion}`,
    bold: true, color: GREY, size: 26 }) ] }));

children.push(kv([
  ["Procedure", `IOS XR ${CFG.targetVersion} upgrade on ${CFG.platform}`],
  ["Customer", CFG.customer],
  ["Prepared by", CFG.provider],
  ["Maintenance Window", "[Insert Date / Time]"],
  ["Devices Affected", CFG.devices.join(",  ")],
  ["Current Version", `Cisco IOS XR Software, Version ${CFG.currentVersion}`],
  ["Target Version", `Cisco IOS XR Software, Version ${CFG.targetVersion}`],
  ["Upgrade Type", "Single-step direct upgrade — validated: no Bridge SMUs, no caveats"],
]));

children.push(h2("Brief Description of Work"));
children.push(P(`Upgrade the ${CFG.customer} ${CFG.platform} routers (${CFG.devices.join(" and ")}) from ` +
  `Cisco IOS XR ${CFG.currentVersion} to ${CFG.targetVersion} using the Cisco install (add / prepare / activate / commit) ` +
  `process. Production traffic is migrated onto the peer router before each router is upgraded, so customer impact is limited ` +
  `to the brief BGP re-convergence during each traffic migration.`, { size: 18 }));
children.push(P("Any discrepancies should be written in the Comments section at the end of this procedure.", { size: 18, italics: true }));
children.push(note("REUSABLE MOP. For a future single-step upgrade (e.g. " + CFG.targetVersion + " → a later release): " +
  "(1) update the version strings and image name in this document; (2) re-run the upgrade-path validation (Step P-4) with the new " +
  ".iso to confirm the direct path and any Bridge SMUs/caveats; (3) confirm the package/RPM set and MD5s against that release's " +
  "Cisco ASR 9000 release notes."));

children.push(h2("Event Documentation"));
children.push(kv([["Date (MM/DD/YY)", "[Insert]"], ["Net Suite Case #", "TBD"],
  ["CMMS ID #", ""], ["CMMS WO #", ""]]));

children.push(h2("Participants"));
children.push(new Table({ width: { size: 10080, type: WidthType.DXA },
  columnWidths: [3200, 2600, 3080, 1200], layout: TableLayoutType.FIXED,
  rows: [
    ["Name / Role", "Company / Title", "Email", "Phone"],
    ["Andrew Ntuyo / Senior Network Engineer", "Skyline Technology Solutions", "antuyo@skylinenet.net", ""],
    ["Haseeb Hameed / Network Architect", "Skyline Technology Solutions", "hhameed@skylinenet.net", ""],
    ["Matt Smith / Chief Network Architect", "Skyline Technology Solutions", "msmith@skylinenet.net", ""],
    ["Nathan Miller / Broadband Network Engineer", "Howard County Office of Broadband", "nmiller@howardcountymd.gov", ""],
    ["HCBN NOC / Service Desk", "Howard County Office of Broadband", "", ""],
  ].map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c, ci) =>
    new TableCell({ width: { size: [3200,2600,3080,1200][ci], type: WidthType.DXA }, borders: cellBorders,
      shading: ri === 0 ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [P(c, { size: 16, bold: ri === 0, color: ri === 0 ? "FFFFFF" : undefined })] })) })),
}));

children.push(h2("References / Supporting Documentation"));
children.push(P("Documents required on hand for execution:", { size: 18, bold: true }));
children.push(kv([
  ["Cisco ASR 9000 IOS XR 25.2.2 Release Notes (supported software packages)", [P(CFG.releaseNotes, { size: 16, color: "0563C1" })]],
  ["Target image", CFG.iso + "  (+ any feature RPMs required by features in use — confirm against the release notes)"],
], 5200, 4880));
children.push(P("Documents used in the creation of this procedure:", { size: 18, bold: true, before: 80 }));
children.push(kv([
  ["IOS XR 25.2.2 Upgrade Path Validation for the ASRs", `Skyline / Howard County, validated ${CFG.validationDate} — direct upgrade supported, no Bridge SMUs`],
  ["HCG ASR9904 Traffic Migration Script (Summary Version)", "Haseeb Hameed — LIGON ⇄ POD production failover"],
  ["ASR9904 IOS XR Upgrade MOP v2", "Prior single-step upgrade to 24.3.2 (install-process reference)"],
], 5200, 4880));

children.push(h2("Procedure Risks"));
children.push(kv([
  ["Risks to personnel safety", "None"],
  ["Risks to critical load", "N/A"],
  ["Risks to site", "Temporary loss of redundancy during each router upgrade; brief BGP re-convergence at each traffic migration. No outage expected while the peer router carries production."],
]));

children.push(h2("Important Indicators"));
children.push(kv([
  ["Change of state", "A step that changes the running state (config commit, activation, reload)."],
  ["Stop & validate", "Do not proceed until the expected result is confirmed."],
  ["Important note", "Critical caveat for the step."],
  ["Rollback", "Rollback trigger / action."],
], 2600, 7480));
children.push(P("Acronyms: MOP – Method of Procedure · SMU – Software Maintenance Update · FPD – Field-Programmable Device · " +
  "RSP – Route Switch Processor · VRRP – Virtual Router Redundancy Protocol · CAB – Change Advisory Board · " +
  "HCBN – Howard County Broadband Network.", { size: 16, italics: true, before: 60 }));

// ---- Operating Procedure
children.push(new Paragraph({ spacing: { before: 240, after: 60 }, children: [
  new TextRun({ text: "Operating Procedure", bold: true, color: NAVY, size: 30 }) ] }));

// Section 1
children.push(band("1. Pre-Work and Mitigation (reusable)"));
children.push(procTable([
  { step: "P-1", loc: "Remote", equip: "N/A", action: [aP("Prepare this MOP.")], init: "AN" },
  { step: "P-2", loc: "Remote", equip: "N/A", action: [aP("Submit the maintenance to CAB / change control for review; obtain approval.")] },
  { step: "P-3", loc: "Remote", equip: "N/A", action: [aP("Issue a maintenance notification to HCBN and affected customers. Impact: temporary loss of redundancy; brief interruption possible during traffic migration.")] },
  { step: "P-4", loc: "Remote", equip: CFG.devices.join(", "), ind: "Stop & validate", action: [
      aBold("Validate the upgrade path (read-only, non-disruptive) on BOTH routers."),
      aP(`Download ${CFG.iso}, copy to harddisk:, and confirm it is present:`),
      ...code(`dir harddisk:`),
      aP("Run the upgrade matrix check against the running software:"),
      ...code(`show install upgrade-matrix iso harddisk:/${CFG.iso} from-running`),
      aP(`Expected result (validated ${CFG.validationDate}):`),
      ...code(`Upgrade from the current software [${CFG.currentVersion}] to ${CFG.targetVersion} is supported\nFrom     To       Bridge SMUs Required     Caveats\n${CFG.currentVersion}   ${CFG.targetVersion}   None                     None`),
      note("If the matrix reports a required Bridge SMU or an intermediate release, STOP and re-plan — this MOP assumes a validated direct path.") ] },
  { step: "P-5", loc: "Remote", equip: CFG.devices.join(", "), action: [
      aP("Download the target image and any required feature RPMs (per the 25.2.2 release notes) and verify integrity:"),
      ...code(`show md5 file harddisk:/${CFG.iso}`) ] },
  { step: "P-6", loc: "Remote", equip: CFG.devices.join(", "), ind: "Important note", action: [
      aBold("Confirm out-of-band / console access to both routers before proceeding."),
      aP("Do not start the upgrade without a verified OOB path — the activate step reloads the router.") ] },
  { step: "P-7", loc: "Remote", equip: CFG.devices.join(", "), ind: "Stop & validate", action: [
      aBold("Collect PRE-upgrade baselines on BOTH routers (retain for comparison):"), ...code(BASELINE) ] },
  { step: "P-8", loc: "Remote", equip: CFG.devices.join(", "), action: [
      aBold("Back up the running configuration on BOTH routers (on-box and off-box):"),
      ...code(`copy running-config harddisk:/pre_${CFG.targetVersion}_running.cfg\nscp harddisk:/pre_${CFG.targetVersion}_running.cfg <user>@<server>:/<path>/`) ] },
  { step: "P-9", loc: "Remote", equip: CFG.devices.join(", "), action: [
      aP("Reclaim disk space on BOTH routers and verify free space:"),
      ...code(`install remove inactive all\nshow media`) ] },
  { step: "P-10", loc: "Remote", equip: "N/A", action: [aP("Notify the Service Desk that the case is starting.")] },
]));
children.push(P("Stage Summary: Pre-Work and mitigation complete; direct upgrade path validated on both routers.", { size: 18, italics: true, before: 60 }));

// Section 2
children.push(band("2. Migrate production traffic off LIGON onto POD"));
children.push(note("Reconcile the Bundle-Ether200 subinterface list below to services STILL in production on the ASRs before execution — " +
  "some services were migrated to the MX platform (per Matt Smith, 2026-09-01). Remove any subinterface no longer carried by the ASRs."));
children.push(procTable([
  { step: "M-1", loc: "Remote", equip: "LIGON-ASR9904-W-01", ind: "Change of state", action: [
      aBold("On LIGON — shut the production bundle and its eBGP/customer sessions:"), ...code(MIG_OFF_LIGON) ] },
  { step: "M-2", loc: "Remote", equip: "POD-ASR9904-W-01", ind: "Change of state", action: [
      aBold("Immediately on POD — bring up the production subinterfaces:"), ...code(MIG_ON_POD) ] },
  { step: "M-3", loc: "Remote", equip: CFG.devices.join(", "), ind: "Stop & validate", action: [
      aBold("Confirm production is now carried by POD; capture and compare to the pre-migration capture:"), ...code(MIG_VERIFY),
      aP("Expected: POD advertising/receiving the customer prefixes; LIGON idle; pings to test hosts clean.") ] },
]));

// Section 3
children.push(band("3. Upgrade LIGON-ASR9904-W-01 to " + CFG.targetVersion + " (LIGON now idle)"));
children.push(procTable(upgradeRows("LIGON-ASR9904-W-01", "L")));
children.push(P("Step Summary: LIGON-ASR9904-W-01 upgraded to " + CFG.targetVersion + " and committed.", { size: 18, italics: true, before: 60 }));

// Section 4
children.push(band("4. Migrate traffic back to standard (LIGON active) — this idles POD"));
children.push(procTable([
  { step: "B-1", loc: "Remote", equip: "POD-ASR9904-W-01", ind: "Change of state", action: [
      aBold("On POD — shut the production subinterfaces:"), ...code(MIG_OFF_POD) ] },
  { step: "B-2", loc: "Remote", equip: "LIGON-ASR9904-W-01", ind: "Change of state", action: [
      aBold("Immediately on LIGON — restore the production bundle and its sessions:"), ...code(MIG_ON_LIGON) ] },
  { step: "B-3", loc: "Remote", equip: CFG.devices.join(", "), ind: "Stop & validate", action: [
      aBold("Confirm LIGON (on new code) is carrying production and POD is now idle:"), ...code(MIG_VERIFY),
      aP("Expected: LIGON advertising/receiving customer prefixes on " + CFG.targetVersion + "; POD idle; pings clean.") ] },
]));

// Section 5
children.push(band("5. Upgrade POD-ASR9904-W-01 to " + CFG.targetVersion + " (POD now idle)"));
children.push(procTable(upgradeRows("POD-ASR9904-W-01", "P2")));
children.push(P("Step Summary: POD-ASR9904-W-01 upgraded to " + CFG.targetVersion + " and committed.", { size: 18, italics: true, before: 60 }));

// Section 6
children.push(band("6. Restore standard state & full redundancy"));
children.push(procTable([
  { step: "R-1", loc: "Remote", equip: CFG.devices.join(", "), ind: "Stop & validate", action: [
      aBold("Confirm both routers are on " + CFG.targetVersion + " and healthy, with redundancy restored to the normal design:"),
      ...code("show version\nshow redundancy\nshow bgp summary\nshow ospf neighbor\nshow vrrp brief\nshow interfaces Bundle-Ether200 brief"),
      aP("Expected: both routers " + CFG.targetVersion + "; BGP/OSPF/VRRP normal; production balanced per standard design; pings clean.") ] },
]));

// Completion
children.push(band("Completion Steps"));
children.push(procTable([
  { step: "C-1", loc: "Remote", equip: CFG.devices.join(", "), action: [aP("Verify logs and alarms are clean on both routers (show logging, show alarm).")] },
  { step: "C-2", loc: "NMS", equip: "HCBN NMS", action: [aP("Verify NMS alerts have recovered and both devices/ports are re-discovered.")] },
  { step: "C-3", loc: "Remote", equip: "N/A", action: [aP("Notify the Service Desk that the case is complete.")] },
]));
children.push(P("Stage Summary: Post-maintenance tasks completed.", { size: 18, italics: true, before: 60 }));

// Rollback
children.push(band("Roll Back Section"));
children.push(procTable([
  { step: "RB-1", loc: "Remote", equip: "Target router", ind: "Rollback", action: [
      aBold("Pre-commit: reload reverts automatically."),
      aP("If the upgrade has NOT been committed, reload the router to revert to " + CFG.currentVersion + ":"),
      ...code("reload location all") ] },
  { step: "RB-2", loc: "Remote", equip: "Target router", ind: "Rollback", action: [
      aBold("Post-commit: reinstall the previous release."),
      ...code(`install add source harddisk:/asr9k-mini-x64-${CFG.currentVersion}.iso\ninstall prepare id <ID>\ninstall activate id <ID> noprompt\ninstall commit`) ] },
  { step: "RB-3", loc: "Remote", equip: CFG.devices.join(", "), ind: "Rollback", action: [
      aBold("Traffic-level rollback."),
      aP("If connectivity is lost during a migration step, re-run the opposite migration script to return production to the healthy router, verify connectivity, then reassess.") ] },
  { step: "RB-4", loc: "Remote", equip: CFG.devices.join(", "), action: [
      aP("General: at any step, if unexpected connectivity loss is observed or reported, roll back the last change, verify connectivity is restored, and re-evaluate the next step.")] },
]));

// Comments / Revision / Approval
children.push(h2("Comments"));
children.push(P(" ", { size: 18 })); children.push(P(" ", { size: 18 }));

children.push(h2("Revision Control"));
children.push(new Table({ width: { size: 10080, type: WidthType.DXA }, columnWidths: [1400, 2200, 3000, 3480],
  layout: TableLayoutType.FIXED, rows: [
    ["Revision", "Date (YYYY/MM/DD)", "Author", "Changes made"],
    [CFG.revision, CFG.revisionDate, CFG.author, "Initial release"],
  ].map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c, ci) =>
    new TableCell({ width: { size: [1400,2200,3000,3480][ci], type: WidthType.DXA }, borders: cellBorders,
      shading: ri === 0 ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [P(c, { size: 18, bold: ri === 0, color: ri === 0 ? "FFFFFF" : undefined })] })) })) }));

children.push(h2("Approval"));
children.push(new Table({ width: { size: 10080, type: WidthType.DXA }, columnWidths: [1400, 2200, 2160, 2160, 2160],
  layout: TableLayoutType.FIXED, rows: [
    ["Revision", "Date", "Author", "Reviewer", "Approver"],
    [CFG.revision, "", "Andrew Ntuyo", "Skyline NetEng Team", "Matt Smith"],
  ].map((r, ri) => new TableRow({ tableHeader: ri === 0, children: r.map((c, ci) =>
    new TableCell({ width: { size: [1400,2200,2160,2160,2160][ci], type: WidthType.DXA }, borders: cellBorders,
      shading: ri === 0 ? { type: ShadingType.CLEAR, fill: NAVY, color: "auto" } : undefined,
      margins: { top: 40, bottom: 40, left: 80, right: 80 },
      children: [P(c, { size: 18, bold: ri === 0, color: ri === 0 ? "FFFFFF" : undefined })] })) })) }));

// ---------------------------------------------------------------- footer (Skyline logo + page numbers)
const logoBuf = fs.readFileSync(CFG.logo);
const footer = new Footer({ children: [ new Table({
  width: { size: 10080, type: WidthType.DXA }, columnWidths: [2000, 5080, 3000],
  layout: TableLayoutType.FIXED, borders: noBorders,
  rows: [ new TableRow({ children: [
    new TableCell({ width: { size: 2000, type: WidthType.DXA }, borders: noBorders,
      children: [ new Paragraph({ children: [ new ImageRun({ type: "png", data: logoBuf,
        transformation: { width: 92, height: 73 } }) ] }) ] }),
    new TableCell({ width: { size: 5080, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
      children: [ new Paragraph({ alignment: AlignmentType.CENTER,
        children: [ new TextRun({ text: "Skyline Technology Solutions — Confidential", size: 14, color: GREY }) ] }) ] }),
    new TableCell({ width: { size: 3000, type: WidthType.DXA }, borders: noBorders, verticalAlign: VerticalAlign.CENTER,
      children: [ new Paragraph({ alignment: AlignmentType.RIGHT,
        children: [ new TextRun({ text: "Page ", size: 16, color: GREY }),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: GREY }),
          new TextRun({ text: " of ", size: 16, color: GREY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: GREY }) ] }) ] }),
  ] }) ],
}) ] });

// ---------------------------------------------------------------- document
const doc = new Document({
  creator: CFG.provider, title: `${CFG.platform} IOS XR ${CFG.targetVersion} Upgrade MOP`,
  styles: { default: { document: { run: { font: "Calibri", size: 20, color: "222222" } } } },
  sections: [ { properties: { page: { size: { width: 12240, height: 15840 },
    margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
    footers: { default: footer }, children } ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.mkdirSync(path.dirname(CFG.out), { recursive: true });
  fs.writeFileSync(CFG.out, buf);
  console.log("wrote", CFG.out, buf.length, "bytes");
});
