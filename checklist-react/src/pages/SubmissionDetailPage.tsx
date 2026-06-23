import { useEffect, useState } from 'react'
import { Button, Card, Input, Modal, Space, Spin, Tag, Typography, message } from 'antd'
import dayjs from 'dayjs'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { downloadChecklistPdf, fetchSubmissionById, rejectChecklistById } from '../api/client'
import type { HistoryRow } from '../api/types'
import { useAuth } from '../auth/AuthContext'
import { SubmissionDetailView } from '../components/SubmissionDetailView'

export default function SubmissionDetailPage() {
  const { resultId } = useParams<{ resultId: string }>()
  const navigate = useNavigate()
  const { isManager } = useAuth()
  const [row, setRow] = useState<HistoryRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  useEffect(() => {
    if (!resultId) {
      setError('Thiếu mã bản ghi.')
      setLoading(false)
      return
    }
    void (async () => {
      try {
        const r = await fetchSubmissionById(resultId)
        setRow(r)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setLoading(false)
      }
    })()
  }, [resultId])

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Spin size="large" />
      </div>
    )
  }

  if (error || !row) {
    return (
      <Card>
        <Typography.Text type="danger">{error ?? 'Không tìm thấy bản ghi.'}</Typography.Text>
        <div style={{ marginTop: 16 }}>
          <Button onClick={() => navigate(-1)}>Quay lại</Button>
        </div>
      </Card>
    )
  }

  const approvePath = row.approvalToken
    ? `/approve?token=${encodeURIComponent(row.approvalToken)}`
    : row.approvalLink.replace(/^https?:\/\/[^/]+/, '')

  return (
    <>
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Card
        title="Chi tiết checklist"
        extra={
          <Space wrap>
            <Button
              onClick={() => {
                void (async () => {
                  try {
                    await downloadChecklistPdf(row)
                    message.success('Đã tải PDF')
                  } catch (e) {
                    message.error(e instanceof Error ? e.message : 'Xuất PDF thất bại')
                  }
                })()
              }}
            >
              Xuất PDF
            </Button>
            {!row.isApproved && row.status !== 'rejected' && isManager && (
              <>
                <Link to={approvePath}>
                  <Button type="primary">Duyệt checklist</Button>
                </Link>
                <Button danger onClick={() => setRejectOpen(true)}>
                  Từ chối
                </Button>
              </>
            )}
            <Button onClick={() => navigate(-1)}>Quay lại</Button>
          </Space>
        }
      >
        <Space direction="vertical" size={4}>
          <Typography.Text>
            <strong>{row.checklistTitle}</strong>
          </Typography.Text>
          <Typography.Text>Người nộp: {row.submitterName}</Typography.Text>
          <Typography.Text type="secondary">{row.submitterEmail}</Typography.Text>
          <Typography.Text>
            Ngày kiểm tra: {dayjs(row.checkDate).format('DD/MM/YYYY')} — Gửi lúc{' '}
            {dayjs(row.createdAtUtc).format('DD/MM/YYYY HH:mm')}
          </Typography.Text>
          <Space>
            {row.totalErrors > 0 ? (
              <Tag color="red">{row.totalErrors} lỗi</Tag>
            ) : (
              <Tag color="green">Không lỗi</Tag>
            )}
            {row.isApproved ? <Tag color="green">Đã duyệt</Tag> : row.status === 'rejected' ? <Tag color="red">Từ chối</Tag> : <Tag color="gold">Chờ duyệt</Tag>}
          </Space>
        </Space>
      </Card>
      <SubmissionDetailView row={row} />
    </Space>
    <Modal
      title="Từ chối checklist"
      open={rejectOpen}
      onCancel={() => setRejectOpen(false)}
      onOk={() => {
        void (async () => {
          try {
            await rejectChecklistById(row.id, rejectReason)
            message.success('Đã từ chối checklist')
            setRejectOpen(false)
            const refreshed = await fetchSubmissionById(row.id)
            setRow(refreshed)
          } catch (e) {
            message.error(e instanceof Error ? e.message : 'Từ chối thất bại')
          }
        })()
      }}
      okText="Xác nhận từ chối"
      okButtonProps={{ danger: true }}
    >
      <Input.TextArea
        rows={3}
        placeholder="Lý do từ chối (tuỳ chọn)"
        value={rejectReason}
        onChange={(e) => setRejectReason(e.target.value)}
      />
    </Modal>
    </>
  )
}
