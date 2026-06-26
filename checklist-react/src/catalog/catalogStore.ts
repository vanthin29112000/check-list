import type { ChecklistDefinition } from './types'

let catalogCache: ChecklistDefinition[] | null = null

export function setCatalogCache(checklists: ChecklistDefinition[]): void {
  catalogCache = checklists
}

export function getCatalogCache(): ChecklistDefinition[] | null {
  return catalogCache
}

export function clearCatalogCache(): void {
  catalogCache = null
}
