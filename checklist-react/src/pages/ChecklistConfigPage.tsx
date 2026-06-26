import { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Input,
  Modal,
  Space,
  Tabs,
  Typography,
  message,
} from 'antd'
import { DeleteOutlined, PlusOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons'
import {
  fetchDefinitions,
  resetChecklistDefinitionsToDefault,
  saveChecklistDefinitions,
} from '../api/client'
import type { ChecklistDefinition, ChecklistGroupDef, ChecklistItemDef } from '../api/types'

function checklistTabLabel(key: string, title: string): string {
  const k = key.toLowerCase()
  if (k === 'cong-khu-a') return 'Khu A'
  if (k === 'cong-khu-b') return 'Khu B'
  if (k === 'phong-server') return 'Phòng server'
  return title.length > 24 ? `${title.slice(0, 24)}…` : title
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

function newItemKey(checklistKey: string, label: string, existing: Set<string>): string {
  const base = `${checklistKey}-${slugify(label) || 'muc-moi'}`
  let key = base
  let n = 2
  while (existing.has(key.toLowerCase())) {
    key = `${base}-${n}`
    n += 1
  }
  return key
}

export default function ChecklistConfigPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checklists, setChecklists] = useState<ChecklistDefinition[]>([])
  const [activeTab, setActiveTab] = useState('0')

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetchDefinitions()
        setChecklists(res.checklists)
      } catch (e) {
        message.error(e instanceof Error ? e.message : 'Không tải được cấu hình checklist.')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  function updateChecklist(ci: number, updater: (c: ChecklistDefinition) => ChecklistDefinition) {
    setChecklists((prev) => prev.map((c, i) => (i === ci ? updater(c) : c)))
  }

  function updateGroup(ci: number, gi: number, updater: (g: ChecklistGroupDef) => ChecklistGroupDef) {
    updateChecklist(ci, (c) => ({
      ...c,
      groups: c.groups.map((g, i) => (i === gi ? updater(g) : g)),
    }))
  }

  function updateItem(ci: number, gi: number, ii: number, updater: (it: ChecklistItemDef) => ChecklistItemDef) {
    updateGroup(ci, gi, (g) => ({
      ...g,
      items: g.items.map((it, i) => (i === ii ? updater(it) : it)),
    }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveChecklistDefinitions(checklists)
      message.success('Đã lưu cấu hình checklist.')
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Lưu thất bại.')
    } finally {
      setSaving(false)
    }
  }

  function handleResetDefault() {
    Modal.confirm({
      title: 'Khôi phục mặc định?',
      content: 'Toàn bộ nội dung checklist sẽ trở về bản gốc. Thao tác này không ảnh hưởng kết quả đã gửi trước đó.',
      okText: 'Khôi phục',
      cancelText: 'Hủy',
      onOk: async () => {
        setSaving(true)
        try {
          const res = await resetChecklistDefinitionsToDefault()
          setChecklists(res.checklists)
          message.success('Đã khôi phục cấu hình mặc định.')
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Khôi phục thất bại.')
        } finally {
          setSaving(false)
        }
      },
    })
  }

  if (loading) {
    return <Card loading />
  }

  const ci = Number(activeTab)

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card>
        <Typography.Title level={4} style={{ marginTop: 0 }}>
          Cấu hình nội dung checklist
        </Typography.Title>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          Chỉnh sửa tên mục, tiêu chuẩn kiểm tra và các mục con. Thay đổi chỉ áp dụng cho checklist mới — kết quả đã
          gửi vẫn giữ nguyên.
        </Typography.Paragraph>
        <Space wrap>
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
            Lưu cấu hình
          </Button>
          <Button icon={<ReloadOutlined />} loading={saving} onClick={handleResetDefault}>
            Khôi phục mặc định
          </Button>
        </Space>
      </Card>

      <Alert
        type="info"
        showIcon
        message="Key mục (mã định danh) không thể sửa sau khi tạo để tránh lệch dữ liệu lịch sử."
      />

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={checklists.map((c, idx) => ({
          key: String(idx),
          label: checklistTabLabel(c.key, c.title),
        }))}
      />

      {checklists[ci] ? (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Card size="small" title="Tiêu đề checklist">
            <Input
              value={checklists[ci].title}
              onChange={(e) => updateChecklist(ci, (c) => ({ ...c, title: e.target.value }))}
            />
          </Card>

          {checklists[ci].groups.map((group, gi) => (
            <Card
              key={`${ci}-${gi}`}
              size="small"
              title={
                <Input
                  placeholder="Tên nhóm (section)"
                  value={group.title}
                  onChange={(e) => updateGroup(ci, gi, (g) => ({ ...g, title: e.target.value }))}
                  style={{ maxWidth: 400 }}
                />
              }
              extra={
                <Button
                  type="dashed"
                  size="small"
                  icon={<PlusOutlined />}
                  onClick={() => {
                    const existing = new Set(
                      checklists[ci].groups.flatMap((g) => g.items.map((it) => it.key.toLowerCase())),
                    )
                    const label = 'Mục mới'
                    const key = newItemKey(checklists[ci].key, label, existing)
                    updateGroup(ci, gi, (g) => ({
                      ...g,
                      items: [
                        ...g.items,
                        { key, label, standard: '', type: 'pass_fail', subchecks: null },
                      ],
                    }))
                  }}
                >
                  Thêm mục
                </Button>
              }
            >
              <Collapse
                accordion
                items={group.items.map((item, ii) => ({
                  key: item.key,
                  label: (
                    <Space>
                      <Typography.Text strong>{item.label || '(Chưa đặt tên)'}</Typography.Text>
                      <Typography.Text type="secondary" code style={{ fontSize: 11 }}>
                        {item.key}
                      </Typography.Text>
                    </Space>
                  ),
                  extra: (
                    <Button
                      type="text"
                      danger
                      size="small"
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation()
                        updateGroup(ci, gi, (g) => ({
                          ...g,
                          items: g.items.filter((_, i) => i !== ii),
                        }))
                      }}
                    />
                  ),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                      <div>
                        <Typography.Text strong>Tên thiết bị / mục</Typography.Text>
                        <Input
                          style={{ marginTop: 6 }}
                          value={item.label}
                          onChange={(e) => updateItem(ci, gi, ii, (it) => ({ ...it, label: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Typography.Text strong>Tiêu chuẩn kiểm tra</Typography.Text>
                        <Input.TextArea
                          style={{ marginTop: 6 }}
                          autoSize={{ minRows: 2, maxRows: 5 }}
                          value={item.standard}
                          onChange={(e) => updateItem(ci, gi, ii, (it) => ({ ...it, standard: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Typography.Text strong>Mục con (ổ đĩa, v.v.)</Typography.Text>
                        <Space direction="vertical" style={{ width: '100%', marginTop: 8 }} size="small">
                          {(item.subchecks ?? []).map((sc, si) => (
                            <Space key={sc.key} wrap style={{ width: '100%' }}>
                              <Input
                                placeholder="Key"
                                value={sc.key}
                                disabled
                                style={{ width: 120 }}
                              />
                              <Input
                                placeholder="Nhãn hiển thị"
                                value={sc.label}
                                onChange={(e) =>
                                  updateItem(ci, gi, ii, (it) => ({
                                    ...it,
                                    subchecks: (it.subchecks ?? []).map((s, j) =>
                                      j === si ? { ...s, label: e.target.value } : s,
                                    ),
                                  }))
                                }
                                style={{ flex: 1, minWidth: 200 }}
                              />
                              <Button
                                type="text"
                                danger
                                icon={<DeleteOutlined />}
                                onClick={() =>
                                  updateItem(ci, gi, ii, (it) => ({
                                    ...it,
                                    subchecks: (it.subchecks ?? []).filter((_, j) => j !== si),
                                  }))
                                }
                              />
                            </Space>
                          ))}
                          <Button
                            type="dashed"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => {
                              const subs = item.subchecks ?? []
                              const sk = `sub-${subs.length + 1}`
                              updateItem(ci, gi, ii, (it) => ({
                                ...it,
                                subchecks: [...subs, { key: sk, label: 'Mục con mới' }],
                              }))
                            }}
                          >
                            Thêm mục con
                          </Button>
                        </Space>
                      </div>
                    </Space>
                  ),
                }))}
              />
            </Card>
          ))}

          <Button
            type="dashed"
            block
            icon={<PlusOutlined />}
            onClick={() =>
              updateChecklist(ci, (c) => ({
                ...c,
                groups: [...c.groups, { title: 'Nhóm mới', items: [] }],
              }))
            }
          >
            Thêm nhóm (section)
          </Button>
        </Space>
      ) : null}
    </Space>
  )
}
