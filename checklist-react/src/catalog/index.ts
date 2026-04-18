import type { ChecklistDefinition, ChecklistItemRef } from "./types";
import { congKhuA } from "./congKhuA";
import { congKhuB } from "./congKhuB";
import { phongServer } from "./phongServer";

export const CHECKLIST_ALL: readonly ChecklistDefinition[] = [congKhuA, congKhuB, phongServer];

export function findChecklist(key: string): ChecklistDefinition | undefined {
  return CHECKLIST_ALL.find((c) => c.key.toLowerCase() === key.toLowerCase());
}

export function flattenItems(checklistKey: string): Map<string, ChecklistItemRef> {
  const def = findChecklist(checklistKey);
  if (!def) throw new Error(`Unknown checklist: ${checklistKey}`);
  const map = new Map<string, ChecklistItemRef>();
  for (const g of def.groups) {
    for (const it of g.items) {
      const k = it.key.toLowerCase();
      if (map.has(k)) throw new Error(`Duplicate item key: ${it.key}`);
      map.set(k, { checklistKey: def.key, groupTitle: g.title, item: it });
    }
  }
  return map;
}

export type {
  ChecklistDefinition,
  ChecklistGroupDef,
  ChecklistItemDef,
  ChecklistSubcheckDef,
} from "./types";
