export function moveSectionToIndex(order: string[], id: string, targetIndex: number): string[] {
  const currentIndex = order.indexOf(id);
  if (currentIndex < 0 || targetIndex < 0 || targetIndex >= order.length || currentIndex === targetIndex) {
    return order;
  }

  const next = [...order];
  const [moved] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function normalizeSectionIds(value: unknown, validIds: string[]): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && validIds.includes(id));
}
