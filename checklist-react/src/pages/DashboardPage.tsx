import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, Col, DatePicker, Drawer, Grid, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd'
import dayjs from 'dayjs'
import { fetchDashboard, fetchDefinitions } from '../api/client'
import type {
  ChecklistDefinition,
  DashboardPendingApproval,
  DashboardResponse,
  DashboardTopFailedItem,
} from '../api/types'

export default function DashboardPage() {
  const { md } = Grid.useBreakpoint()
  const isMobile = !md
  const urgentRef = useRef<HTMLDivElement | null>(null)
  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [checklistKey, setChecklistKey] = useState<string | undefined>()
  const [submitterFilter, setSubmitterFilter] = useState<string | undefined>()
  const [fromDate, setFromDate] = useState(dayjs().subtract(30, 'day'))
  const [toDate, setToDate] = useState(dayjs())
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false)

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
  const completionRate = overview.totalSubmissions > 0 ? Math.round((overview.passSubmissions / overview.totalSubmissions) * 100) : 0

  const submitterOptions = useMemo(
    () => (data?.bySubmitter ?? []).map((x) => ({ label: x.submitterName, value: x.submitterName })),
    [data],
  )

  const byChecklist = useMemo(() => {
    return [...(data?.byChecklist ?? [])].sort((a, b) => b.totalErrors - a.totalErrors)
  }, [data])
  const topFailedItems = useMemo(() => {
    return [...(data?.topFailedItems ?? [])].sort((a, b) => b.failedCount - a.failedCount)
  }, [data])
  const pendingApprovals = useMemo(() => {
    const arr = [...(data?.pendingApprovals ?? [])]
    if (!submitterFilter) return arr
    return arr.filter((x) => x.submitterName === submitterFilter)
  }, [data, submitterFilter])
  const bySubmitter = useMemo(() => {
    const arr = [...(data?.bySubmitter ?? [])].sort((a, b) => b.totalErrors - a.totalErrors)
    if (!submitterFilter) return arr
    return arr.filter((x) => x.submitterName === submitterFilter)
  }, [data, submitterFilter])

  const errorTrend7d = useMemo(() => {
    const rows = [...(data?.errorsByDate ?? [])].slice(-7)
    const max = Math.max(1, ...rows.map((x) => x.totalErrors))
    return rows.map((x) => ({
      ...x,
      pct: Math.round((x.totalErrors / max) * 100),
    }))
  }, [data])

  function renderFilters(vertical = false) {
    return (
      <Space wrap direction={vertical ? 'vertical' : 'horizontal'} style={vertical ? { width: '100%' } : undefined}>
        <Select
          allowClear
          placeholder="Lọc checklist"
          style={{ width: vertical ? '100%' : 220 }}
          options={catalog.map((c) => ({ label: c.title, value: c.key }))}
          value={checklistKey}
          onChange={(v) => setChecklistKey(v)}
        />
        <Select
          allowClear
          placeholder="Người kiểm tra"
          style={{ width: vertical ? '100%' : 180 }}
          options={submitterOptions}
          value={submitterFilter}
          onChange={(v) => setSubmitterFilter(v)}
        />
        <DatePicker value={fromDate} onChange={(d) => d && setFromDate(d)} />
        <DatePicker value={toDate} onChange={(d) => d && setToDate(d)} />
        <Button type="primary" onClick={() => void load()}>
          Tải dữ liệu
        </Button>
      </Space>
    )
  }

  return (
    <Space direction="vertical" size="large" style={{ width: '100%' }}>
      <Card
        title="Bộ lọc dashboard"
        extra={
          isMobile ? (
            <Button onClick={() => setFilterDrawerOpen(true)}>Mở bộ lọc</Button>
          ) : (
            renderFilters(false)
          )
        }
      >
        <Card
          size="small"
          style={{
            borderColor: overview.totalErrors > 0 ? '#fca5a5' : '#bbf7d0',
            background: overview.totalErrors > 0 ? '#fff7f7' : '#f6ffed',
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Typography.Text strong style={{ fontSize: 18 }}>
              Hôm nay ({dayjs().format('DD/MM')})
            </Typography.Text>
            <Typography.Text style={{ color: overview.totalErrors > 0 ? '#dc2626' : '#15803d', fontSize: 16 }}>
              {overview.totalErrors > 0 ? `⚠️ ${overview.totalErrors} lỗi cần xử lý` : '✅ Không có lỗi nghiêm trọng'}
            </Typography.Text>
            <Typography.Text>📋 {overview.totalSubmissions} checklist</Typography.Text>
            <Typography.Text>✅ {completionRate}% hoàn thành</Typography.Text>
            <Typography.Text>⏳ {overview.pendingApprovalCount} chờ duyệt</Typography.Text>
            <Button
              type={overview.totalErrors > 0 ? 'primary' : 'default'}
              danger={overview.totalErrors > 0}
              onClick={() => urgentRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              Xem lỗi ngay
            </Button>
          </Space>
        </Card>
      </Card>

      <div style={{ overflowX: 'auto', whiteSpace: 'nowrap' }}>
        <Space size={12} wrap={false}>
          <Card size="small" style={{ minWidth: 160 }}>
            <Statistic title="✅ Đạt" value={overview.passSubmissions} valueStyle={{ color: '#16a34a' }} />
          </Card>
          <Card size="small" style={{ minWidth: 160 }}>
            <Statistic title="❌ Lỗi" value={overview.failedSubmissions} valueStyle={{ color: '#dc2626' }} />
          </Card>
          <Card size="small" style={{ minWidth: 160 }}>
            <Statistic title="⏳ Chờ duyệt" value={overview.pendingApprovalCount} valueStyle={{ color: '#eab308' }} />
          </Card>
        </Space>
      </div>

      <Card title="Xu hướng lỗi 7 ngày gần nhất">
        <Space direction="vertical" size={8} style={{ width: '100%' }}>
          {errorTrend7d.map((x) => (
            <div key={x.date}>
              <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                <Typography.Text>{dayjs(x.date).format('DD/MM')}</Typography.Text>
                <Typography.Text strong style={{ color: x.totalErrors > 0 ? '#dc2626' : '#16a34a' }}>
                  {x.totalErrors} lỗi
                </Typography.Text>
              </Space>
              <div style={{ height: 8, borderRadius: 999, background: '#f1f5f9', overflow: 'hidden' }}>
                <div style={{ width: `${x.pct}%`, height: '100%', background: x.totalErrors > 0 ? '#ef4444' : '#16a34a' }} />
              </div>
            </div>
          ))}
        </Space>
      </Card>

      <Card title="Lỗi nổi bật cần xử lý" ref={urgentRef}>
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {topFailedItems.slice(0, 8).map((x) => (
            <Card key={`${x.itemKey}-${x.groupTitle}`} size="small" hoverable>
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text strong>{x.label}</Typography.Text>
                <Typography.Text type="secondary">{x.groupTitle}</Typography.Text>
                <Typography.Text style={{ color: '#dc2626' }}>⚠️ {x.failedCount} lỗi</Typography.Text>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      <Card title="Chờ duyệt (xử lý ngay)">
        <Space direction="vertical" style={{ width: '100%' }} size="small">
          {pendingApprovals.slice(0, 10).map((r) => (
            <Card key={r.id} size="small">
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Typography.Text strong>{r.checklistTitle}</Typography.Text>
                <Typography.Text>👤 {r.submitterName}</Typography.Text>
                <Typography.Text style={{ color: '#dc2626' }}>⚠️ {r.totalErrors} lỗi</Typography.Text>
                <Typography.Text type="secondary">📅 {dayjs(r.checkDate).format('DD/MM/YYYY')}</Typography.Text>
                <Space>
                  <Button type="primary" size="small" onClick={() => window.open(r.approvalLink, '_blank')}>
                    Duyệt
                  </Button>
                  <Button size="small" onClick={() => window.open(r.approvalLink, '_blank')}>
                    Xem
                  </Button>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      <Card title="Theo người kiểm tra">
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {bySubmitter.map((r) => (
            <Card key={r.submitterEmail} size="small">
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text strong>{r.submitterName}</Typography.Text>
                <Typography.Text type="secondary">{r.submitterEmail}</Typography.Text>
                <Space>
                  <Tag color="green">✅ {r.passSubmissions}</Tag>
                  <Tag color={r.totalErrors > 0 ? 'red' : 'green'}>❌ {r.totalErrors}</Tag>
                  <Tag>{r.submissions} bản</Tag>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      <Card title="Theo checklist">
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          {byChecklist.map((r) => (
            <Card key={r.checklistKey} size="small">
              <Space direction="vertical" size={4} style={{ width: '100%' }}>
                <Typography.Text strong>{r.checklistTitle}</Typography.Text>
                <Space>
                  <Tag color="green">✅ {r.passSubmissions}</Tag>
                  <Tag color={r.totalErrors > 0 ? 'red' : 'green'}>❌ {r.totalErrors}</Tag>
                  <Tag>📋 {r.submissions}</Tag>
                </Space>
              </Space>
            </Card>
          ))}
        </Space>
      </Card>

      {!isMobile && (
        <Card title="Bảng chi tiết desktop">
          <Row gutter={[12, 12]}>
            <Col xs={24} lg={12}>
              <Table<DashboardTopFailedItem>
                size="small"
                pagination={false}
                rowKey={(r) => `${r.itemKey}-${r.groupTitle}`}
                dataSource={topFailedItems}
                columns={[
                  { title: 'Nhóm', dataIndex: 'groupTitle', width: 180 },
                  { title: 'Thiết bị', dataIndex: 'label' },
                  { title: 'Số lần lỗi', dataIndex: 'failedCount', width: 100 },
                ]}
              />
            </Col>
            <Col xs={24} lg={12}>
              <Table<DashboardPendingApproval>
                size="small"
                pagination={false}
                rowKey={(r) => r.id}
                dataSource={pendingApprovals}
                columns={[
                  { title: 'Checklist', dataIndex: 'checklistTitle' },
                  { title: 'Người nộp', dataIndex: 'submitterName', width: 130 },
                  {
                    title: 'Lỗi',
                    dataIndex: 'totalErrors',
                    width: 70,
                    render: (n: number) => (n > 0 ? <Tag color="red">{n}</Tag> : <Tag color="green">0</Tag>),
                  },
                  { title: 'Ngày', dataIndex: 'checkDate', width: 90, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
                ]}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Drawer
        title="Bộ lọc dashboard"
        placement="bottom"
        height="auto"
        open={filterDrawerOpen}
        onClose={() => setFilterDrawerOpen(false)}
      >
        {renderFilters(true)}
      </Drawer>
    </Space>
  )
}
