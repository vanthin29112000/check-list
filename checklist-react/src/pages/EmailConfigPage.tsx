import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Alert, Button, Card, Input, Space, Tabs, Typography, message } from 'antd'
import { DeleteOutlined, MailOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchEmailRecipientsConfig,
  saveEmailRecipientsConfig,
  sendTestChecklistEmail,
} from '../api/client'
import { fetchEmailConfigFromEnv } from '../api/emailConfigFromEnv'
import type { EmailRecipientRow } from '../api/types'

function RecipientEditor({
  rows,
  setRows,
  hint,
}: {
  rows: EmailRecipientRow[]
  setRows: Dispatch<SetStateAction<EmailRecipientRow[]>>
  hint: string
}) {
  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      <Typography.Text type="secondary">{hint}</Typography.Text>
      {rows.map((row, i) => (
        <Space key={i} style={{ width: '100%', flexWrap: 'wrap' }} align="baseline">
          <Input
            placeholder="Họ tên"
            value={row.displayName}
            onChange={(e) => {
              const v = [...rows]
              v[i] = { ...v[i], displayName: e.target.value }
              setRows(v)
            }}
            style={{ width: 200, maxWidth: '100%' }}
          />
          <Input
            placeholder="email@domain"
            value={row.email}
            onChange={(e) => {
              const v = [...rows]
              v[i] = { ...v[i], email: e.target.value }
              setRows(v)
            }}
            style={{ width: 280, maxWidth: '100%' }}
          />
          <Button
            type="text"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setRows(rows.filter((_, j) => j !== i))}
            aria-label="Xóa dòng"
          />
        </Space>
      ))}
      <Button type="dashed" icon={<PlusOutlined />} onClick={() => setRows([...rows, { displayName: '', email: '' }])}>
        Thêm người
      </Button>
    </Space>
  )
}

export default function EmailConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [leaders, setLeaders] = useState<EmailRecipientRow[]>([])
  const [hrStaff, setHrStaff] = useState<EmailRecipientRow[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const recipients = await fetchEmailRecipientsConfig()
        setLeaders(recipients.leaders)
        setHrStaff(recipients.hrStaff)
        const noLeaders = recipients.leaders.every((x) => !x.email.trim())
        if (noLeaders) {
          try {
            const fromEnv = await fetchEmailConfigFromEnv()
            if (fromEnv.leaders.length > 0) setLeaders(fromEnv.leaders)
            if (fromEnv.hrStaff.length > 0) setHrStaff(fromEnv.hrStaff)
          } catch {
            /* .env server chưa sẵn sàng */
          }
        }
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Không tải được cấu hình.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function persistRecipients(leadersRows: EmailRecipientRow[], hrRows: EmailRecipientRow[]) {
    await saveEmailRecipientsConfig({
      leaders: leadersRows
        .map((x) => ({ displayName: x.displayName.trim(), email: x.email.trim() }))
        .filter((x) => x.email.length > 0),
      hrStaff: hrRows
        .map((x) => ({ displayName: x.displayName.trim(), email: x.email.trim() }))
        .filter((x) => x.email.length > 0),
    })
  }

  async function syncFromEnv() {
    setSyncing(true)
    try {
      const fromEnv = await fetchEmailConfigFromEnv()
      if (fromEnv.leaders.length > 0) setLeaders(fromEnv.leaders)
      if (fromEnv.hrStaff.length > 0) setHrStaff(fromEnv.hrStaff)
      message.success('Đã lấy danh sách từ .env (LEADER_EMAILS, HR_EMAILS). Bấm Lưu để ghi Firestore.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Không đọc được .env server.')
    } finally {
      setSyncing(false)
    }
  }

  async function saveAll() {
    setSaving(true)
    try {
      await persistRecipients(leaders, hrStaff)
      message.success('Đã lưu cấu hình người nhận.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    try {
      await persistRecipients(leaders, hrStaff)
      await sendTestChecklistEmail()
      message.success('Đã gửi mail thử tới lãnh đạo. Kiểm tra hộp thư (và spam).')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Gửi mail thử thất bại.')
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card loading={loading} title="Cấu hình email thông báo checklist">
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="Máy chủ gửi mail (SMTP / Resend)"
        description="Cấu hình trong file .env ở gốc repo (SMTP_HOST, SMTP_USER, SMTP_PASS hoặc RESEND_API_KEY, PUBLIC_BASE_URL). Restart npm run dev sau khi sửa .env."
      />
      <Tabs
        items={[
          {
            key: 'leaders',
            label: 'Lãnh đạo',
            children: (
              <RecipientEditor
                rows={leaders}
                setRows={setLeaders}
                hint="Nhận email có link duyệt checklist. Có thể đồng bộ từ LEADER_EMAILS trong .env."
              />
            ),
          },
          {
            key: 'hr',
            label: 'Nhân sự',
            children: (
              <RecipientEditor
                rows={hrStaff}
                setRows={setHrStaff}
                hint="Gán quyền quản lý khi đăng nhập lần đầu — không nhận mail duyệt (chỉ lãnh đạo/quản lý đã đăng nhập)."
              />
            ),
          },
        ]}
      />
      <Space style={{ marginTop: 24 }} wrap>
        <Button loading={syncing} onClick={() => void syncFromEnv()}>
          Nhập từ .env (server)
        </Button>
        <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveAll()}>
          Lưu cấu hình
        </Button>
        <Button icon={<MailOutlined />} loading={testing} onClick={() => void sendTest()}>
          Gửi mail thử
        </Button>
      </Space>
    </Card>
  )
}
