import { useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import { Button, Card, Input, Space, Tabs, Typography, message } from 'antd'
import { DeleteOutlined, PlusOutlined, SaveOutlined } from '@ant-design/icons'
import { fetchEmailRecipientsConfig, saveEmailRecipientsConfig } from '../api/client'
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
  const [leaders, setLeaders] = useState<EmailRecipientRow[]>([])
  const [hrStaff, setHrStaff] = useState<EmailRecipientRow[]>([])

  useEffect(() => {
    void (async () => {
      try {
        const c = await fetchEmailRecipientsConfig()
        setLeaders(c.leaders)
        setHrStaff(c.hrStaff)
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Không tải được cấu hình.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function save() {
    setSaving(true)
    try {
      await saveEmailRecipientsConfig({
        leaders: leaders.map((x) => ({ displayName: x.displayName.trim(), email: x.email.trim() })).filter((x) => x.email.length > 0),
        hrStaff: hrStaff.map((x) => ({ displayName: x.displayName.trim(), email: x.email.trim() })).filter((x) => x.email.length > 0),
      })
      message.success('Đã lưu cấu hình email.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card loading={loading} title="Cấu hình email thông báo checklist">
      <Typography.Paragraph>
        Danh sách lưu trên Firestore (<code>appSettings/emailRecipients</code>). Khi nộp checklist hoặc gửi lại mail, hệ
        thống gửi cho <strong>tất cả</strong> email lãnh đạo và nhân sự (cùng nội dung có link duyệt). Nếu cả hai nhóm
        không có email hợp lệ, server Netlify dùng biến môi trường <code>LEADER_EMAILS</code>, <code>HR_EMAILS</code>,{' '}
        <code>MANAGER_EMAILS</code>.
      </Typography.Paragraph>
      <Tabs
        items={[
          {
            key: 'leaders',
            label: 'Lãnh đạo',
            children: (
              <RecipientEditor
                rows={leaders}
                setRows={setLeaders}
                hint="Người nhận bản mail có link duyệt và dashboard."
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
                hint="Người nhận cùng nội dung thông báo (phòng nhân sự, hành chính…)."
              />
            ),
          },
        ]}
      />
      <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void save()} style={{ marginTop: 24 }}>
        Lưu cấu hình
      </Button>
    </Card>
  )
}
