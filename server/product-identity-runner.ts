import { pool } from "./db";
import {
  proposeProductIdentity,
  type ProductIdentityInput,
  type ProductIdentityProposal,
} from "./product-identity";

export type ProductIdentityRunStatus = {
  running: boolean;
  mode: "preview" | "apply" | null;
  phase: "idle" | "scanning" | "storing" | "complete" | "error";
  startedAt: string | null;
  finishedAt: string | null;
  scannedDeals: number;
  eligibleDeals: number;
  highConfidence: number;
  mediumConfidence: number;
  productFamilies: number;
  exactVariants: number;
  storedProposals: number;
  message: string | null;
  sample: Array<ProductIdentityProposal & { sourceTitle: string }>;
};

let status: ProductIdentityRunStatus = freshStatus();

function freshStatus(): ProductIdentityRunStatus {
  return {
    running: false,
    mode: null,
    phase: "idle",
    startedAt: null,
    finishedAt: null,
    scannedDeals: 0,
    eligibleDeals: 0,
    highConfidence: 0,
    mediumConfidence: 0,
    productFamilies: 0,
    exactVariants: 0,
    storedProposals: 0,
    message: null,
    sample: [],
  };
}

export function getProductIdentityRunStatus(): ProductIdentityRunStatus {
  return { ...status, sample: [...status.sample] };
}

export function startProductIdentityRun(mode: "preview" | "apply"): {
  started: boolean;
  status: ProductIdentityRunStatus;
} {
  if (status.running) return { started: false, status: getProductIdentityRunStatus() };
  status = {
    ...freshStatus(),
    running: true,
    mode,
    phase: "scanning",
    startedAt: new Date().toISOString(),
  };
  void run(mode);
  return { started: true, status: getProductIdentityRunStatus() };
}

async function run(mode: "preview" | "apply"): Promise<void> {
  const client = await pool.connect();
  const proposals: ProductIdentityProposal[] = [];
  const sourceTitles = new Map<string, string>();
  let cursor = "";
  try {
    await client.query(mode === "preview"
      ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY"
      : "BEGIN ISOLATION LEVEL SERIALIZABLE");
    while (true) {
      const result = await client.query<ProductIdentityInput>(
        `SELECT id, title, brand, sport_id AS "sportId",
                equipment_type_id AS "equipmentTypeId", condition,
                drop_weight AS "dropWeight", size_number AS "sizeNumber", raw
           FROM deals
          WHERE id > $1
          ORDER BY id
          LIMIT 5000`,
        [cursor],
      );
      if (result.rows.length === 0) break;
      status.scannedDeals += result.rows.length;
      for (const row of result.rows) {
        const proposal = proposeProductIdentity(row);
        if (!proposal) continue;
        proposals.push(proposal);
        sourceTitles.set(proposal.dealId, row.title);
      }
      cursor = result.rows[result.rows.length - 1].id;
    }

    const highConfidence = proposals.filter((proposal) => proposal.confidence === "high");
    status.eligibleDeals = proposals.length;
    status.highConfidence = highConfidence.length;
    status.mediumConfidence = proposals.length - highConfidence.length;
    status.productFamilies = new Set(proposals.map((proposal) => proposal.familyFingerprint)).size;
    status.exactVariants = new Set(proposals.map((proposal) => proposal.variantFingerprint)).size;
    status.sample = highConfidence.slice(0, 25).map((proposal) => ({
      sourceTitle: sourceTitles.get(proposal.dealId) ?? "",
      ...proposal,
    }));

    if (mode === "apply") {
      status.phase = "storing";
      for (const proposal of highConfidence) {
        const identity = await client.query<{ id: string }>(
          `INSERT INTO product_identities (
             family_fingerprint, variant_fingerprint, canonical_brand, product_family,
             model_code, sport_id, equipment_type_id, variant, confidence, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,'proposed')
           ON CONFLICT (variant_fingerprint) DO UPDATE SET
             canonical_brand=EXCLUDED.canonical_brand,
             product_family=EXCLUDED.product_family,
             model_code=EXCLUDED.model_code,
             sport_id=EXCLUDED.sport_id,
             equipment_type_id=EXCLUDED.equipment_type_id,
             variant=EXCLUDED.variant,
             confidence=EXCLUDED.confidence,
             updated_at=NOW()
           RETURNING id`,
          [
            proposal.familyFingerprint, proposal.variantFingerprint,
            proposal.canonicalBrand, proposal.productFamily, proposal.modelCode,
            proposal.sportId, proposal.equipmentTypeId,
            JSON.stringify(proposal.variant), proposal.confidence,
          ],
        );
        await client.query(
          `INSERT INTO deal_product_identities (
             deal_id, product_identity_id, confidence, status, match_method, evidence
           ) VALUES ($1,$2,$3,'proposed','deterministic',$4::jsonb)
           ON CONFLICT (deal_id) DO UPDATE SET
             product_identity_id=EXCLUDED.product_identity_id,
             confidence=EXCLUDED.confidence,
             status=CASE
               WHEN deal_product_identities.status IN ('approved','rejected')
               THEN deal_product_identities.status
               ELSE 'proposed'
             END,
             evidence=EXCLUDED.evidence,
             assigned_at=NOW()`,
          [
            proposal.dealId, identity.rows[0].id, proposal.confidence,
            JSON.stringify(proposal.evidence),
          ],
        );
        status.storedProposals += 1;
      }
      await client.query("COMMIT");
    } else {
      await client.query("ROLLBACK");
    }
    status.phase = "complete";
    status.message = mode === "apply"
      ? `${status.storedProposals.toLocaleString()} safe proposals stored for review`
      : `${status.highConfidence.toLocaleString()} safe proposals found; no changes made`;
  } catch (error: any) {
    try { await client.query("ROLLBACK"); } catch {}
    status.phase = "error";
    status.message = error?.message || "Product identity run failed";
  } finally {
    status.running = false;
    status.finishedAt = new Date().toISOString();
    client.release();
  }
}
