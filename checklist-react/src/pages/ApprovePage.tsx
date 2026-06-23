import { useEffect, useState } from 'react'
import { Button, Card, Result, Space, Spin, Tag, Typography, message } from 'antd'
import { useSearchParams } from 'react-router-dom'
import {
  confirmApproveChecklistByToken,
  fetchSubmissionPreviewByToken,
  type ApprovePageVm,
} from '../api/checklistFirestore'
import { downloadChecklistPdf } from '../api/client'
import { SubmissionDetailView } from '../components/SubmissionDetailView'
import { useAuth } from '../auth/AuthContext'

export default function ApprovePage() {
  const [params] = useSearchParams()
  const token = params.get('token')
  const { user, profile } = useAuth()
  const [vm, setVm] = useState<ApprovePageVm | null>(null)
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const out = await fetchSubmissionPreviewByToken(token)
        setVm(out)
      } catch (e) {
        setVm({
          success: false,
          message: e instanceof Error ? e.message : String(e),
          checklistTitle: '',
          submitterName: '',
          approverName: '',
          approvedAtText: '',
          totalItems: 0,
          failedItems: 0,
        })
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  async function handleApprove() {
    if (!token || approving) return
    setApproving(true)
    try {
      const idToken = user ? await user.getIdToken() : null
      const out = await confirmApproveChecklistByToken(token, {
        email: profile?.email ?? user?.email ?? null,
        name: profile?.displayName ?? user?.displayName ?? null,
        idToken,
      })
      setVm(out)
      if (out.success) message.success('Đã duyệt checklist')
      else message.error(out.message)
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Duyệt thất bại')
    } finally {
      setApproving(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
        <Typography.Paragraph style={{ marginTop: 16 }}>Đang tải checklist…</Typography.Paragraph>
      </div>
    )
  }

  if (!vm) return null

  const done = vm.alreadyApproved || (vm.success && vm.approverName && vm.approvedAtText)

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: 16 }}>
      <Card title="Duyệt checklist" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {vm.checklistTitle}
          </Typography.Title>
          <Typography.Text>Người nộp: {vm.submitterName}</Typography.Text>
          <Space>
            {vm.failedItems > 0 ? (
              <Tag color="red">{vm.failedItems} lỗi</Tag>
            ) : (
              <Tag color="green">Không lỗi</Tag>
            )}
            {vm.alreadyApproved ? <Tag color="green">Đã duyệt</Tag> : <Tag color="gold">Chờ duyệt</Tag>}
          </Space>
          {vm.alreadyApproved && (
            <Typography.Text type="secondary">
              {vm.approverName ? `Người duyệt: ${vm.approverName}` : null}
              {vm.approvedAtText ? ` — ${vm.approvedAtText}` : null}
            </Typography.Text>
          )}
        </Space>
      </Card>

      {vm.submission ? <SubmissionDetailView row={vm.submission} /> : null}

      <Card style={{ marginTop: 16 }}>
        {done ? (
          <Result status="success" title="Checklist đã duyệt" subTitle={vm.message} />
        ) : vm.success ? (
          <Space wrap>
            {vm.submission && (
              <Button
                onClick={() => {
                  void (async () => {
                    try {
                      await downloadChecklistPdf(vm.submission!)
                      message.success('Đã tải PDF')
                    } catch (e) {
                      message.error(e instanceof Error ? e.message : 'Xuất PDF thất bại')
                    }
                  })()
                }}
              >
                Tải PDF
              </Button>
            )}
            <Button type="primary" loading={approving} onClick={() => void handleApprove()}>
              Xác nhận duyệt
            </Button>
          </Space>
        ) : (
          <Result status="error" title="Không thể duyệt" subTitle={vm.message} />
        )}
      </Card>
    </div>
  )
}
