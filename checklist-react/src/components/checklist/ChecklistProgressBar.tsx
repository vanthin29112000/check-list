import { Alert, Button, Card, Col, Input, Progress, Row, Select, Space, Typography } from 'antd'

export interface ChecklistSummary {
  totalItems: number
  passedCount: number
  failedCount: number
  unansweredCount: number
}

interface ChecklistProgressBarProps {
  checklistOptions: { value: string; label: string; disabled?: boolean }[]
  checklistKey?: string
  onChecklistChange: (key: string) => void
  submitterName: string
  activeTitle?: string
  summary: ChecklistSummary
  completedPercent: number
  hasChecklist: boolean
  onClearDraft: () => void
  onSubmit?: () => void
  isMobile?: boolean
  canSubmit?: boolean
  busy?: boolean
}

export function ChecklistProgressBar({
  checklistOptions,
  checklistKey,
  onChecklistChange,
  submitterName,
  activeTitle,
  summary,
  completedPercent,
  hasChecklist,
  onClearDraft,
  onSubmit,
  isMobile,
  canSubmit,
  busy,
}: ChecklistProgressBarProps) {
  return (
    <Card title="Thông tin phiên checklist" styles={{ body: { background: '#fafafa' } }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={10} lg={8}>
          <Typography.Text strong>Checklist</Typography.Text>
          <Select
            style={{ width: '100%', marginTop: 8 }}
            options={checklistOptions}
            value={checklistKey}
            onChange={onChecklistChange}
            placeholder="Chọn checklist"
          />
        </Col>
        <Col xs={24} md={8} lg={6}>
          <Typography.Text strong>Người kiểm tra</Typography.Text>
          <Input style={{ marginTop: 8 }} value={submitterName} readOnly />
        </Col>
        {hasChecklist && (
          <Col xs={24} md={6} lg={10}>
            <Typography.Text strong>Tiến độ</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Progress
                percent={completedPercent}
                strokeColor={summary.failedCount > 0 ? '#ef4444' : '#16a34a'}
                trailColor="#e5e7eb"
                format={() => `${summary.passedCount + summary.failedCount}/${summary.totalItems}`}
              />
              <Space wrap size={12} style={{ marginTop: 8 }}>
                <Typography.Text type="success">Đạt: {summary.passedCount}</Typography.Text>
                <Typography.Text type={summary.failedCount > 0 ? 'danger' : undefined}>
                  Lỗi: {summary.failedCount}
                </Typography.Text>
                <Typography.Text type="secondary">Chưa: {summary.unansweredCount}</Typography.Text>
                <Button size="small" onClick={onClearDraft}>
                  Xóa bản nháp
                </Button>
              </Space>
            </div>
          </Col>
        )}
      </Row>

      {hasChecklist && summary.failedCount > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={`Có ${summary.failedCount} mục không đạt. Hãy kiểm tra đầy đủ ghi chú trước khi gửi.`}
        />
      )}

      {isMobile && hasChecklist && onSubmit && (
        <div style={{ marginTop: 16 }}>
          <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
            {activeTitle ?? 'Checklist'}
          </Typography.Text>
          <Button type="primary" block loading={busy} disabled={!canSubmit} onClick={onSubmit}>
            Gửi checklist
          </Button>
        </div>
      )}
    </Card>
  )
}
