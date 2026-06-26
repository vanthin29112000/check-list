import { useEffect, useState } from 'react'
import { Button, Card, Divider, Modal, Result, Space, Spin, Tag, Typography, message } from 'antd'
import { CheckCircleOutlined, FilePdfOutlined } from '@ant-design/icons'
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

  async function executeApprove() {
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
      if (out.success) {
        message.success(out.message || 'Đã duyệt checklist')
      } else {
        message.error(out.message)
      }
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Duyệt thất bại')
    } finally {
      setApproving(false)
    }
  }

  function handleApproveClick() {
    if (!vm?.success || vm.alreadyApproved) return
    Modal.confirm({
      title: 'Xác nhận duyệt checklist',
      content: (
        <Space direction="vertical" size={4}>
          <Typography.Text>
            Bạn xác nhận duyệt checklist <strong>{vm.checklistTitle}</strong> của{' '}
            <strong>{vm.submitterName}</strong>?
          </Typography.Text>
          <Typography.Text type="secondary">Hành động này không thể hoàn tác.</Typography.Text>
          {vm.failedItems > 0 && (
            <Typography.Text type="warning">Lưu ý: Checklist có {vm.failedItems} mục không đạt.</Typography.Text>
          )}
        </Space>
      ),
      okText: 'Xác nhận duyệt',
      cancelText: 'Hủy',
      okButtonProps: { danger: false, type: 'primary' },
      onOk: () => executeApprove(),
    })
  }

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
        <Typography.Paragraph style={{ marginTop: 16 }}>Đang tải nội dung checklist…</Typography.Paragraph>
      </div>
    )
  }

  if (!vm) return null

  const done = vm.alreadyApproved || (vm.success && vm.approverName && vm.approvedAtText)

  return (
    <div style={{ maxWidth: 960, margin: '24px auto', padding: 16, paddingBottom: done ? 16 : 100 }}>
      <Card title="Xem nội dung checklist" style={{ marginBottom: 16 }}>
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Typography.Title level={4} style={{ margin: 0 }}>
            {vm.checklistTitle}
          </Typography.Title>
          <Typography.Text>Người nộp: {vm.submitterName}</Typography.Text>
          <Space wrap>
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
          {vm.submission && (
            <Button
              icon={<FilePdfOutlined />}
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
        </Space>
      </Card>

      {vm.submission ? (
        <>
          <Typography.Title level={5} style={{ marginBottom: 12 }}>
            Chi tiết các mục đã kiểm tra
          </Typography.Title>
          <SubmissionDetailView row={vm.submission} />
        </>
      ) : null}

      {done ? (
        <Card style={{ marginTop: 16 }}>
          <Result
            status="success"
            icon={<CheckCircleOutlined />}
            title="Checklist đã duyệt"
            subTitle={
              vm.message.includes('email') || vm.message.includes('thông báo')
                ? vm.message
                : `${vm.message}${vm.message.includes('người kiểm tra') ? '' : ' Đã gửi email thông báo tới người kiểm tra.'}`
            }
          />
        </Card>
      ) : vm.success ? (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 100,
            background: '#fff',
            borderTop: '1px solid #e2e8f0',
            boxShadow: '0 -4px 16px rgba(15, 23, 42, 0.08)',
            padding: '16px 24px',
          }}
        >
          <div style={{ maxWidth: 960, margin: '0 auto' }}>
            <Divider style={{ margin: '0 0 12px' }} />
            <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
              <Typography.Text type="secondary">
                Vui lòng xem kỹ nội dung checklist trước khi duyệt
              </Typography.Text>
              <Button type="primary" size="large" loading={approving} onClick={handleApproveClick}>
                Duyệt checklist
              </Button>
            </Space>
          </div>
        </div>
      ) : (
        <Card style={{ marginTop: 16 }}>
          <Result status="error" title="Không thể xem checklist" subTitle={vm.message} />
        </Card>
      )}
    </div>
  )
}
