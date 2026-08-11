export const DEALS_PAGE_SIZE = 60;
export const DEALS_PAGE_SIZE_OPTIONS = [30, 60, 90, 120, 200] as const;

export function nextDealsOffset(currentOffset: number, pageSize: number, direction: "previous" | "next") {
  return direction === "previous"
    ? Math.max(0, currentOffset - pageSize)
    : currentOffset + pageSize;
}

export function dealsPageNumber(offset: number, pageSize: number) {
  return Math.floor(Math.max(0, offset) / pageSize) + 1;
}

export function mayHaveNextDealsPage(resultCount: number, pageSize: number) {
  return resultCount === pageSize;
}
