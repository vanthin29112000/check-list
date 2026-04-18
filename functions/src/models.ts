export interface ChecklistResultDetailDoc {
  itemKey: string;
  groupTitle: string;
  label: string;
  standard: string;
  passed: boolean;
  note: string | null;
}

export interface ChecklistResultDoc {
  id: string;
  checklistKey: string;
  checklistTitle: string;
  submitterName: string;
  submitterEmail: string;
  checkDate: string;
  totalErrors: number;
  createdAtUtc: Date;
  approvalToken: string;
  isApproved: boolean;
  approvedAtUtc: Date | null;
  details: ChecklistResultDetailDoc[];
  pdfStoragePath?: string | null;
}
