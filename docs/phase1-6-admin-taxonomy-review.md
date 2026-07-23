# Phase 1.6 admin taxonomy review

Phase 1.6 is an admin-only, non-mutating review workflow for decisions derived from a
Phase 1.5 read-only taxonomy packet. It does not import decisions, apply
classifications, or write review state to the application database.

## Offline baseline

The supplied `taxonomy-audit-output-phase1-5.zip` was inspected offline. Its SHA-256
is:

`1739255CB40AA147B8B5382959D88E0A039F337090D250B7DE4B2A888B4A6073`

The embedded review packet reconciles to:

- 1,283 proposed taxonomy corrections;
- 75,303 unresolved/manual records;
- 33 supported identifier recommendations;
- 2,439 quarantined identifier findings;
- 2,472 total identifier findings.

No production audit was run. The supplied bundle is development evidence only and
is not committed to the repository.

## Trust and authorization boundary

The page is available at `/app/admin/taxonomy-review`. It uses the existing
server-issued `user.isAdmin` authorization state used by the main Admin page.
Unauthenticated users follow the existing sign-in flow, and authenticated
non-admin users see an access-denied screen.

There is deliberately no Phase 1.6 server endpoint. The administrator selects
`taxonomy-review-packet.json`, the browser reads it locally, and the packet is not
uploaded. Decisions live in a React in-memory `Map` for the lifetime of the page.
There is no local storage, browser database, server storage, or production
database persistence.

## Queue boundaries

The parser accepts only packets declaring `mode: "read-only"` and
`applySupported: false`. Summary counts must exactly match the packet arrays.

Only these records become decision-capable queue items:

1. `proposedCorrections` records whose outcome is `proposed-correction`, which
   require human approval and contain a canonical destination;
2. `likelySameProductConflicts` records containing an independently supported
   recommendation, marked human-review-required and consensus-ineligible.

The parser reports counts for the 75,303 unresolved/manual records and the 2,439
quarantined identifier findings but never maps them into the approval queue. A
decision request for any key outside the two approved queues is rejected.

## Review model

Current and proposed sport/equipment classifications are displayed side by side.
The queue supports filters for priority, source, current classification, proposed
destination, availability, and review status.

Review priority and classification confidence remain separate values. Priority
only controls review ordering. A `critical` priority never grants automatic
approval and does not change confidence.

An administrator can approve, reject, or defer an eligible item and may attach a
reviewer note. Re-deciding an item replaces only its in-memory decision.

## Bundle and decision identity

The browser calculates a SHA-256 over the exact imported JSON bytes. The resulting
`sha256:<hex>` value is the audit-bundle identity included in every decision and
at the export root.

Each exported decision includes:

- deal ID or scoped identifier identity;
- original sport/equipment classifications;
- proposed sport/canonical equipment classification;
- approve, reject, or defer decision;
- reviewer and ISO-8601 UTC decision timestamp;
- optional reviewer note;
- review priority and confidence;
- Phase 1.5 rule version;
- audit-bundle identity.

JSON and CSV exporters sort decisions by stable queue key and use fixed field
ordering. The same decision state therefore produces byte-for-byte deterministic
output.

## Explicit non-goals

Phase 1.6 does not provide:

- decision-file import;
- approval execution;
- taxonomy updates or merges;
- deal reclassification or backfill;
- maintenance or migration execution;
- startup behavior;
- production audit access;
- any database write path.

Any later decision-import or classification-application design requires a
separate review and change.
