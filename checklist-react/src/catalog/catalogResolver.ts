import { CHECKLIST_ALL, findChecklist as findInList, flattenItems as flattenInList } from './index'
import { getCatalogCache } from './catalogStore'
import type { ChecklistDefinition, ChecklistItemRef } from './types'

function activeCatalog(): readonly ChecklistDefinition[] {
  return getCatalogCache() ?? CHECKLIST_ALL
}

export function findChecklistFromCache(key: string): ChecklistDefinition | undefined {
  const list = activeCatalog()
  return list.find((c) => c.key.toLowerCase() === key.toLowerCase()) ?? findInList(key)
}

export function flattenItemsFromCache(checklistKey: string): Map<string, ChecklistItemRef> {
  const def = findChecklistFromCache(checklistKey)
  if (!def) throw new Error(`Unknown checklist: ${checklistKey}`)
  const map = new Map<string, ChecklistItemRef>()
  for (const g of def.groups) {
    for (const it of g.items) {
      const k = it.key.toLowerCase()
      if (map.has(k)) throw new Error(`Duplicate item key: ${it.key}`)
      map.set(k, { checklistKey: def.key, groupTitle: g.title, item: it })
    }
  }
  return map
}

/** Re-export flatten for compatibility when cache is set */
export function flattenItemsWithCache(checklistKey: string): Map<string, ChecklistItemRef> {
  const cached = getCatalogCache()
  if (cached) return flattenItemsFromCache(checklistKey)
  return flattenInList(checklistKey)
}

export function findChecklistWithCache(key: string): ChecklistDefinition | undefined {
  const cached = getCatalogCache()
  if (cached) return findChecklistFromCache(key)
  return findInList(key)
}
