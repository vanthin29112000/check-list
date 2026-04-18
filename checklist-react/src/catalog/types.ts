export interface ChecklistSubcheckDef {
  key: string;
  label: string;
}

export interface ChecklistItemDef {
  key: string;
  label: string;
  standard: string;
  type: string;
  subchecks?: ChecklistSubcheckDef[] | null;
}

export interface ChecklistGroupDef {
  title: string;
  items: ChecklistItemDef[];
}

export interface ChecklistDefinition {
  key: string;
  title: string;
  groups: ChecklistGroupDef[];
}

export interface ChecklistItemRef {
  checklistKey: string;
  groupTitle: string;
  item: ChecklistItemDef;
}
