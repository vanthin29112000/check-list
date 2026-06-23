import { Card, Space, Table, Tag, Typography } from 'antd'
import type { HistoryDetail, HistoryRow } from '../api/types'

export function SubmissionDetailView({ row }: { row: Pick<HistoryRow, 'details'> }) {
  const groups = new Map<string, HistoryDetail[]>()
  for (const d of row.details) {
    if (!groups.has(d.groupTitle)) groups.set(d.groupTitle, [])
    groups.get(d.groupTitle)!.push(d)
  }

  return (
    <Space direction="vertical" style={{ width: '100%' }} size="middle">
      {[...groups.entries()].map(([groupTitle, items]) => (
        <Card key={groupTitle} size="small" title={groupTitle}>
          <Table
            size="small"
            pagination={false}
            rowKey="itemKey"
            dataSource={items}
            scroll={{ x: 860 }}
            bordered
            columns={[
              {
                title: 'Thiết bị',
                dataIndex: 'label',
                width: '24%',
                render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
              },
              { title: 'Tiêu chuẩn', dataIndex: 'standard', width: '42%' },
              {
                title: 'Kiểm tra',
                dataIndex: 'passed',
                width: '14%',
                render: (p: boolean) => (p ? <Tag color="green">Đạt</Tag> : <Tag color="red">Không đạt</Tag>),
              },
              {
                title: 'Ghi chú',
                dataIndex: 'note',
                width: '20%',
                render: (v: string | null | undefined) => v || '-',
              },
            ]}
          />
        </Card>
      ))}
    </Space>
  )
}
