export interface DealSubFilterSyncInput {
  title?: string | null;
  equipmentTypeId?: string | null;
  subFilterId?: string | null;
  subFilterIds?: string[] | null;
}

export interface DealSubFilterCandidate {
  dealId: string;
  subFilterId: string;
  equipmentTypeId: string;
}

export type SubFilterEquipmentTypeMap = ReadonlyMap<string, string>;

export function validPrimarySubFilterId(
  subFilterId: string | null | undefined,
  equipmentTypeId: string | null | undefined,
  currentMappings: SubFilterEquipmentTypeMap,
): string | null {
  if (!subFilterId || !equipmentTypeId) return null;
  return currentMappings.get(subFilterId) === equipmentTypeId ? subFilterId : null;
}

export function collectValidDealSubFilterCandidates(
  dealId: string,
  deal: DealSubFilterSyncInput,
  currentMappings: SubFilterEquipmentTypeMap,
  classifyAllSubFilters: (title: string, equipmentTypeId: string) => string[] = () => [],
): DealSubFilterCandidate[] {
  const equipmentTypeId = deal.equipmentTypeId;
  if (!equipmentTypeId) return [];

  const tags = new Set<string>();
  if (deal.subFilterId) tags.add(deal.subFilterId);
  for (const tag of deal.subFilterIds ?? []) {
    if (tag) tags.add(tag);
  }
  if (deal.title) {
    try {
      for (const tag of classifyAllSubFilters(deal.title, equipmentTypeId)) {
        tags.add(tag);
      }
    } catch {
      // Classification is enrichment only. Preserve the main deal and any
      // already-validated supplied tags if a classifier rule fails.
    }
  }

  return Array.from(tags)
    .filter((subFilterId) => currentMappings.get(subFilterId) === equipmentTypeId)
    .map((subFilterId) => ({ dealId, subFilterId, equipmentTypeId }));
}

export async function writeDealSubFilterCandidates(
  candidates: DealSubFilterCandidate[],
  writeChunk: (chunk: DealSubFilterCandidate[]) => Promise<void>,
  warn: (message: string) => void,
  chunkSize = 500,
): Promise<void> {
  const unique = new Map<string, DealSubFilterCandidate>();
  for (const candidate of candidates) {
    unique.set(`${candidate.dealId}\u0000${candidate.subFilterId}`, candidate);
  }
  const rows = Array.from(unique.values());

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    try {
      await writeChunk(chunk);
    } catch {
      warn(
        `Skipped multi-tag updates after one batch write failed; ${rows.length - offset} tag candidates were left unchanged.`,
      );
      return;
    }
  }
}
