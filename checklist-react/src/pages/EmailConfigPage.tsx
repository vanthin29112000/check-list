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
        Danh sách lưu trên Firestore (<code>appSettings/emailRecipients</code>). <strong>Lãnh đạo</strong> nhận mail có
        link duyệt và dashboard. <strong>Nhân sự</strong>: khi ai đó nộp checklist, nếu ô Họ tên trên form trùng (không
        phân biệt hoa thường) với một dòng ở đây, email tương ứng nhận bản <em>thông báo</em> (tóm tắt + link dashboard),
        <em>không</em> có link duyệt. Điền email rồi bấm Lưu. Lần đầu mở trang, hệ thống gợi ý sẵn họ tên.
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
                hint="Ví dụ: Nguyễn Hoàng Bảo Trung — nhận mail có link duyệt và dashboard."
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
                hint="Họ tên phải khớp ô Họ tên lúc nộp checklist — nhận mail thông báo (không link duyệt)."
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
