import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pool } from "../server/db";
import {
  proposeProductIdentity,
  type ProductIdentityInput,
  type ProductIdentityProposal,
} from "../server/product-identity";

function valueAfter(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

const apply = process.argv.includes("--apply");
const includeMedium = process.argv.includes("--include-medium");
const outputPath = resolve(valueAfter("--output") ?? "./product-identity-audit.json");
const pageSize = 5_000;
const proposals: ProductIdentityProposal[] = [];
const sourceTitles = new Map<string, string>();
let scanned = 0;
let cursor = "";

const client = await pool.connect();
try {
  if (!apply) {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  } else {
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
  }

  while (true) {
    const result = await client.query<ProductIdentityInput>(
      `SELECT id, title, brand, sport_id AS "sportId",
              equipment_type_id AS "equipmentTypeId", condition,
              drop_weight AS "dropWeight", size_number AS "sizeNumber", raw
         FROM deals
        WHERE id > $1
        ORDER BY id
        LIMIT $2`,
      [cursor, pageSize],
    );
    if (result.rows.length === 0) break;
    scanned += result.rows.length;
    for (const row of result.rows) {
      const proposal = proposeProductIdentity(row);
      if (proposal) {
        proposals.push(proposal);
        sourceTitles.set(proposal.dealId, row.title);
      }
    }
    cursor = result.rows[result.rows.length - 1].id;
  }

  const families = new Map<string, ProductIdentityProposal[]>();
  const variants = new Map<string, ProductIdentityProposal[]>();
  for (const proposal of proposals) {
    const familyItems = families.get(proposal.familyFingerprint) ?? [];
    familyItems.push(proposal);
    families.set(proposal.familyFingerprint, familyItems);
    const variantItems = variants.get(proposal.variantFingerprint) ?? [];
    variantItems.push(proposal);
    variants.set(proposal.variantFingerprint, variantItems);
  }

  const storageCandidates = proposals.filter(
    (proposal) => proposal.confidence === "high" || includeMedium,
  );
  if (apply) {
    for (const proposal of storageCandidates) {
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
        [proposal.dealId, identity.rows[0].id, proposal.confidence, JSON.stringify(proposal.evidence)],
      );
    }
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }

  const report = {
    version: 1,
    mode: apply ? "applied-proposals" : "read-only-preview",
    applyPolicy: includeMedium ? "high-and-medium-confidence" : "high-confidence-only",
    generatedAt: new Date().toISOString(),
    scannedDeals: scanned,
    eligibleDeals: proposals.length,
    productFamilies: families.size,
    exactVariants: variants.size,
    highConfidence: proposals.filter((item) => item.confidence === "high").length,
    mediumConfidence: proposals.filter((item) => item.confidence === "medium").length,
    storageCandidates: storageCandidates.length,
    multiSellerFamilies: Array.from(families.values()).filter((items) =>
      new Set(items.map((item) => item.dealId)).size >= 2).length,
    sample: proposals.slice(0, 50).map((proposal) => ({
      sourceTitle: sourceTitles.get(proposal.dealId) ?? "",
      ...proposal,
    })),
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ...report, sample: undefined, outputPath }, null, 2));
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
