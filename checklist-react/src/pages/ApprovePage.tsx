import { useEffect, useState } from 'react'
import { Card, Result, Spin, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { approveChecklistByToken, type ApprovePageVm } from '../api/checklistFirestore'

export default function ApprovePage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const [vm, setVm] = useState<ApprovePageVm | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      try {
        const out = await approveChecklistByToken(token)
        setVm(out)
      } catch (e) {
        setVm({
          success: false,
          message: e instanceof Error ? e.message : String(e),
          checklistTitle: '',
          submitterName: '',
          approverName: 'Nguyễn Hoàng Bảo Trung',
          approvedAtText: '',
          totalItems: 0,
          failedItems: 0,
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
        <Typography.Paragraph style={{ marginTop: 16 }}>Đang xử lý duyệt checklist…</Typography.Paragraph>
      </div>
    )
  }

  if (!vm) return null

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: 16 }}>
      <Card>
        <Result
          status={vm.success ? 'success' : 'error'}
          title={vm.success ? 'Duyệt checklist thành công' : 'Không thể duyệt checklist'}
          subTitle={vm.message}
        />
        {vm.success ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
            Checklist: <strong>{vm.checklistTitle}</strong>
            <br />
            Người nộp: <strong>{vm.submitterName}</strong>
            <br />
            Người duyệt: {vm.approverName}
            <br />
            Thời gian: {vm.approvedAtText}
            <br />
            Tổng hạng mục: {vm.totalItems} — Không đạt: {vm.failedItems}
          </Typography.Paragraph>
        ) : null}
      </Card>
    </div>
  )
}
