import { useEffect, useMemo, useState } from 'react'
import { Button, Card, Col, DatePicker, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { fetchDashboard, fetchDefinitions } from '../api/client'
import type {
  ChecklistDefinition,
  DashboardChecklistRow,
  DashboardDateRow,
  DashboardPendingApproval,
  DashboardResponse,
  DashboardSubmitterRow,
  DashboardTopFailedItem,
} from '../api/types'

export default function DashboardPage() {
  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [checklistKey, setChecklistKey] = useState<string | undefined>()
  const [fromDate, setFromDate] = useState(dayjs().subtract(30, 'day'))
  const [toDate, setToDate] = useState(dayjs())
  const [data, setData] = useState<DashboardResponse | null>(null)

  async function load() {
    const res = await fetchDashboard({
      checklistKey: checklistKey || undefined,
      fromDate: fromDate.format('YYYY-MM-DD'),
      toDate: toDate.format('YYYY-MM-DD'),
    })
    setData(res)
  }

  useEffect(() => {
    void (async () => {
      const defs = await fetchDefinitions()
      setCatalog(defs.checklists)
      await load()
    })()
  }, [])

  const overview = useMemo(
    () =>
      data?.overview ?? {
        totalSubmissions: 0,
        passSubmissions: 0,
        failedSubmissions: 0,
        totalErrors: 0,
        approvedCount: 0,
        pendingApprovalCount: 0,
      },
    [data],
  )

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="Bộ lọc dashboard"
        extra={
          <Space>
            <Select
              allowClear
              placeholder="Lọc checklist"
              style={{ width: 260 }}
              options={catalog.map((c) => ({ label: c.title, value: c.key }))}
              value={checklistKey}
              onChange={(v) => setChecklistKey(v)}
            />
            <DatePicker value={fromDate} onChange={(d) => d && setFromDate(d)} />
            <DatePicker value={toDate} onChange={(d) => d && setToDate(d)} />
            <Button type="primary" onClick={() => void load()}>
              Tải dữ liệu
            </Button>
          </Space>
        }
      >
        <Row gutter={[12, 12]}>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Tổng checklist" value={overview.totalSubmissions} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Đạt" value={overview.passSubmissions} valueStyle={{ color: '#16a34a' }} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Có lỗi" value={overview.failedSubmissions} valueStyle={{ color: '#dc2626' }} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Tổng lỗi" value={overview.totalErrors} valueStyle={{ color: '#f97316' }} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Đã duyệt" value={overview.approvedCount} />
            </Card>
          </Col>
          <Col xs={12} md={8} lg={4}>
            <Card size="small">
              <Statistic title="Chờ duyệt" value={overview.pendingApprovalCount} valueStyle={{ color: '#eab308' }} />
            </Card>
          </Col>
        </Row>
      </Card>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Theo checklist">
            <Table<DashboardChecklistRow>
              size="small"
              pagination={false}
              rowKey={(r) => r.checklistKey}
              dataSource={data?.byChecklist ?? []}
              columns={[
                { title: 'Checklist', dataIndex: 'checklistTitle' },
                { title: 'Số bản', dataIndex: 'submissions', width: 80 },
                { title: 'Lỗi', dataIndex: 'totalErrors', width: 80 },
                { title: 'Đạt', dataIndex: 'passSubmissions', width: 80 },
                { title: 'Duyệt', dataIndex: 'approvedCount', width: 80 },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Lỗi theo ngày">
            <Table<DashboardDateRow>
              size="small"
              pagination={false}
              rowKey={(r) => r.date}
              dataSource={data?.errorsByDate ?? []}
              columns={[
                { title: 'Ngày', dataIndex: 'date', render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
                { title: 'Số bản', dataIndex: 'submissions', width: 90 },
                { title: 'Tổng lỗi', dataIndex: 'totalErrors', width: 90 },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Card title="Top mục lỗi hay gặp">
            <Table<DashboardTopFailedItem>
              size="small"
              pagination={false}
              rowKey={(r) => `${r.itemKey}-${r.groupTitle}`}
              dataSource={data?.topFailedItems ?? []}
              columns={[
                { title: 'Nhóm', dataIndex: 'groupTitle', width: 180 },
                { title: 'Thiết bị', dataIndex: 'label' },
                { title: 'Số lần lỗi', dataIndex: 'failedCount', width: 100 },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card title="Chờ duyệt">
            <Table<DashboardPendingApproval>
              size="small"
              pagination={false}
              rowKey={(r) => r.id}
              dataSource={data?.pendingApprovals ?? []}
              columns={[
                { title: 'Checklist', dataIndex: 'checklistTitle' },
                { title: 'Người nộp', dataIndex: 'submitterName', width: 130 },
                { title: 'Lỗi', dataIndex: 'totalErrors', width: 70, render: (n: number) => (n > 0 ? <Tag color="red">{n}</Tag> : <Tag color="green">0</Tag>) },
                { title: 'Ngày', dataIndex: 'checkDate', width: 90, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
              ]}
            />
          </Card>
        </Col>
      </Row>

      <Card title="Theo người kiểm tra">
        <Table<DashboardSubmitterRow>
          size="small"
          rowKey={(r) => r.submitterEmail}
          dataSource={data?.bySubmitter ?? []}
          columns={[
            { title: 'Người kiểm tra', dataIndex: 'submitterName', width: 180 },
            { title: 'Email', dataIndex: 'submitterEmail' },
            { title: 'Số bản', dataIndex: 'submissions', width: 90 },
            { title: 'Tổng lỗi', dataIndex: 'totalErrors', width: 90 },
            { title: 'Số bản đạt', dataIndex: 'passSubmissions', width: 110 },
          ]}
        />
        <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
          Dashboard theo dõi vận hành checklist, lỗi nổi bật và trạng thái duyệt.
        </Typography.Paragraph>
      </Card>
    </Space>
  )
}
