export interface DepartmentHierarchyRow {
  id: string;
  name: string;
  active: boolean;
  parentId: string | null;
}

export function selectableDepartmentParents(
  rows: readonly DepartmentHierarchyRow[],
  editingId: string | null,
): DepartmentHierarchyRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));

  return rows.filter((candidate) => {
    if (!candidate.active || candidate.id === editingId) return false;
    if (!editingId) return true;

    const visited = new Set<string>();
    let cursor: DepartmentHierarchyRow | undefined = candidate;
    while (cursor?.parentId) {
      if (cursor.parentId === editingId) return false;
      if (visited.has(cursor.id)) return false;
      visited.add(cursor.id);
      cursor = byId.get(cursor.parentId);
    }
    return true;
  });
}

export function departmentParentPatch(
  selectedParentId: string,
  currentParentId: string | null,
  editing: boolean,
): { parent_department_id?: string | null } {
  const selected = selectedParentId || null;
  if (editing && selected === currentParentId) return {};
  if (!editing && selected === null) return {};
  return { parent_department_id: selected };
}

export function parseDesignationLevel(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
    throw new Error("Level must be a whole number from 0 to 100.");
  }
  return parsed;
}

export function designationLevelPatch(
  value: string,
  currentLevel: number | null,
  editing: boolean,
): { level?: number | null } {
  const parsed = parseDesignationLevel(value);
  if (editing && parsed === currentLevel) return {};
  if (!editing && parsed === null) return {};
  return { level: parsed };
}
