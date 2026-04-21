export interface ChecklistSubcheckDef {
  key: string
  label: string
}

export interface ChecklistItemDef {
  key: string
  label: string
  standard: string
  type: string
  subchecks?: ChecklistSubcheckDef[] | null
}

export interface ChecklistGroupDef {
  title: string
  items: ChecklistItemDef[]
}

export interface ChecklistDefinition {
  key: string
  title: string
  groups: ChecklistGroupDef[]
}

export interface DefinitionsResponse {
  checklists: ChecklistDefinition[]
}

export interface SubmitChecklistRequest {
  checklistKey: string
  submitterName: string
  submitterEmail: string
  checkDate: string
  responses: {
    itemKey: string
    passed: boolean
    note?: string | null
    subchecks?: { key: string; passed: boolean }[] | null
  }[]
}

export interface SubmitChecklistResponse {
  resultId: string
  totalErrors: number
  failureLabels: string[]
  approvalLink: string
}

export interface HistoryDetail {
  itemKey: string
  groupTitle: string
  label: string
  standard: string
  passed: boolean
  note?: string | null
}

export interface HistoryRow {
  id: string
  checklistKey: string
  checklistTitle: string
  submitterName: string
  submitterEmail: string
  checkDate: string
  totalErrors: number
  createdAtUtc: string
  isApproved: boolean
  approvedAtUtc?: string | null
  approvalLink: string
  /** Số văn bản PDF 001/CL-CNTTDL… (bản ghi cũ có thể không có) */
  clDocSerial?: number
  details: HistoryDetail[]
}

export interface HistoryResponse {
  total: number
  items: HistoryRow[]
}

export interface DashboardOverview {
  totalSubmissions: number
  passSubmissions: number
  failedSubmissions: number
  totalErrors: number
  approvedCount: number
  pendingApprovalCount: number
}

export interface DashboardChecklistRow {
  checklistKey: string
  checklistTitle: string
  submissions: number
  totalErrors: number
  passSubmissions: number
  approvedCount: number
}

export interface DashboardDateRow {
  date: string
  submissions: number
  totalErrors: number
}

export interface DashboardTopFailedItem {
  itemKey: string
  groupTitle: string
  label: string
  failedCount: number
}

export interface DashboardSubmitterRow {
  submitterName: string
  submitterEmail: string
  submissions: number
  totalErrors: number
  passSubmissions: number
}

export interface DashboardPendingApproval {
  id: string
  checklistTitle: string
  submitterName: string
  checkDate: string
  totalErrors: number
  approvalLink: string
}

export interface DashboardResponse {
  overview: DashboardOverview
  byChecklist: DashboardChecklistRow[]
  errorsByDate: DashboardDateRow[]
  topFailedItems: DashboardTopFailedItem[]
  bySubmitter: DashboardSubmitterRow[]
  pendingApprovals: DashboardPendingApproval[]
}

export interface ChecklistCompletionStatus {
  checklistKey: string
  isCompletedToday: boolean
  completedCount: number
}

export interface CompletionStatusResponse {
  date: string
  items: ChecklistCompletionStatus[]
}

export interface DailyStatusChecklist {
  checklistKey: string
  checklistTitle: string
  isChecked: boolean
  completedCount: number
  status: 'checked' | 'missing_required' | 'not_required' | 'weekly_pending' | 'weekly_done'
}

export interface DailyStatusRow {
  checkDate: string
  checklists: DailyStatusChecklist[]
}

export interface DailyStatusResponse {
  items: DailyStatusRow[]
}
