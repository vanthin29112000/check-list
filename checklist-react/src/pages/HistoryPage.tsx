import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Card, DatePicker, Grid, Progress, Segmented, Select, Space, Table, Tag, Typography, notification } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { downloadChecklistPdf, fetchDailyStatus, fetchDefinitions, fetchHistory, resendChecklistEmail } from '../api/client'
import type { ChecklistDefinition, DailyStatusChecklist, DailyStatusRow, HistoryRow } from '../api/types'

export default function HistoryPage() {
  const { md } = Grid.useBreakpoint()
  const isMobile = !md
  const todayCardRef = useRef<HTMLDivElement | null>(null)
  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [checklistKey, setChecklistKey] = useState<string | undefined>()
  const [checkDate, setCheckDate] = useState<Dayjs | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [month, setMonth] = useState<Dayjs>(dayjs())
  const [mobileScheduleView, setMobileScheduleView] = useState<'list' | 'calendar'>('list')
  const [dayQuickFilter, setDayQuickFilter] = useState<'all' | 'error' | 'ok' | 'weekly_pending'>('all')
  const [dailyRows, setDailyRows] = useState<DailyStatusRow[]>([])
  const [notiApi, contextHolder] = notification.useNotification()

  async function load(p = page) {
    const res = await fetchHistory({
      checklistKey: checklistKey || undefined,
      checkDate: checkDate ? checkDate.format('YYYY-MM-DD') : undefined,
      page: p,
      pageSize,
    })
    setTotal(res.total)
    setRows(res.items)
  }

  async function loadDailyStatus(targetMonth = month) {
    const fromDate = targetMonth.startOf('month').format('YYYY-MM-DD')
    const toDate = targetMonth.endOf('month').format('YYYY-MM-DD')
    const res = await fetchDailyStatus({ fromDate, toDate })
    setDailyRows(res.items)
  }

  useEffect(() => {
    void (async () => {
      const d = await fetchDefinitions()
      setCatalog(d.checklists)
    })()
  }, [])

  useEffect(() => {
    void load(1)
    setPage(1)
  }, [checklistKey, checkDate])

  useEffect(() => {
    void load(page)
  }, [page])

  useEffect(() => {
    void loadDailyStatus(month)
  }, [month])

  useEffect(() => {
    if (!isMobile || mobileScheduleView !== 'list') return
    const t = window.setTimeout(() => {
      todayCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 250)
    return () => window.clearTimeout(t)
  }, [month, isMobile, mobileScheduleView])

  const columns: ColumnsType<HistoryRow> = [
    {
      title: 'Ngày kiểm tra',
      dataIndex: 'checkDate',
      width: 150,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY'),
    },
    {
      title: 'Ngày giờ gửi',
      dataIndex: 'createdAtUtc',
      width: 170,
      render: (v: string) => dayjs(v).format('DD/MM/YYYY hh:mm'),
    },
    { title: 'Checklist', dataIndex: 'checklistTitle', width: 160 },
    { title: 'Người gửi', dataIndex: 'submitterName', width: 160 },
    { title: 'Email', dataIndex: 'submitterEmail', ellipsis: true },
    {
      title: 'Lỗi',
      dataIndex: 'totalErrors',
      width: 90,
      render: (n: number) => (n > 0 ? <Tag color="red">{n}</Tag> : <Tag color="green">0</Tag>),
    },
    {
      title: 'PDF',
      key: 'pdf',
      width: 110,
      render: (_, r) => (
        <Button
          size="small"
          onClick={() => {
            void (async () => {
              try {
                await downloadChecklistPdf(r)
                notiApi.success({ message: 'Đã tải PDF', placement: 'topRight' })
              } catch (e) {
                const m = e instanceof Error ? e.message : String(e)
                notiApi.error({
                  message: 'Xuất PDF thất bại',
                  description: m,
                  placement: 'topRight',
                })
              }
            })()
          }}
        >
          Xuất PDF
        </Button>
      ),
    },
    {
      title: 'Mail',
      key: 'resendMail',
      width: 130,
      render: (_, r) => (
        <Button
          size="small"
          onClick={async () => {
            try {
              const out = await resendChecklistEmail(r.id)
              if (out.skipped) {
                notiApi.error({
                  message: 'Gửi lại mail thất bại',
                  description: out.message,
                  placement: 'topRight',
                })
              } else {
                notiApi.success({
                  message: 'Gửi lại mail thành công',
                  description: `Checklist "${r.checklistTitle}" đã được gửi lại email.`,
                  placement: 'topRight',
                })
              }
            } catch (e) {
              const ax = e as { response?: { data?: { error?: string } }; message?: string }
              notiApi.error({
                message: 'Gửi lại mail thất bại',
                description: ax.response?.data?.error ?? ax.message ?? 'Không thể gửi lại email checklist.',
                placement: 'topRight',
              })
            }
          }}
        >
          Gửi lại mail
        </Button>
      ),
    },
    {
      title: 'Duyệt',
      key: 'approve',
      width: 120,
      render: (_, r) => (
        r.isApproved ? <Tag color="green">Đã duyệt</Tag> : <Tag color="gold">Chờ duyệt</Tag>
      ),
    },
  ]

  function renderChecklistLikeView(row: HistoryRow) {
    const groups = new Map<string, typeof row.details>()
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
                {
                  title: 'Tiêu chuẩn',
                  dataIndex: 'standard',
                  width: '42%',
                },
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

  const weekBlocks = useMemo(() => {
    const weekMap = new Map<string, DailyStatusRow[]>()
    for (const r of dailyRows) {
      const weekStart = dayjs(r.checkDate).startOf('week').add(1, 'day').format('YYYY-MM-DD')
      if (!weekMap.has(weekStart)) weekMap.set(weekStart, [])
      weekMap.get(weekStart)!.push(r)
    }

    return [...weekMap.entries()]
      .sort((a, b) => dayjs(a[0]).valueOf() - dayjs(b[0]).valueOf())
      .map(([weekStart, weekRows]) => {
        const dayMap = new Map<string, DailyStatusRow>()
        for (const r of weekRows) dayMap.set(dayjs(r.checkDate).format('YYYY-MM-DD'), r)
        const dayDates = Array.from({ length: 7 }, (_, idx) => dayjs(weekStart).add(idx, 'day'))
        const days = dayDates.map((d) => {
          const row = dayMap.get(d.format('YYYY-MM-DD'))
          return {
            date: d,
            a: pickChecklistStatus(row, catalog, 'cong-khu-a', 'a'),
            b: pickChecklistStatus(row, catalog, 'cong-khu-b', 'b'),
            s: pickChecklistStatus(row, catalog, 'phong-server', 'server'),
          }
        })

        return {
          key: weekStart,
          title: `Tuần ${dayjs(weekStart).format('DD/MM')} - ${dayjs(weekStart).add(6, 'day').format('DD/MM')}`,
          days,
        }
      })
  }, [dailyRows, catalog])

  const mobileDayCards = useMemo(() => {
    return dailyRows
      .map((r) => {
        const date = dayjs(r.checkDate)
        const counts = { ok: 0, missing: 0, weeklyPending: 0, na: 0 }
        for (const c of r.checklists) {
          if (c.status === 'checked' || c.status === 'weekly_done') counts.ok += 1
          else if (c.status === 'weekly_pending') counts.weeklyPending += 1
          else if (c.status === 'not_required') counts.na += 1
          else counts.missing += 1
        }
        const total = r.checklists.length
        const done = counts.ok + counts.na
        const progress = total > 0 ? Math.round((done / total) * 100) : 0
        const isToday = date.isSame(dayjs(), 'day')
        const hasError = counts.missing > 0 || counts.weeklyPending > 0
        return {
          date,
          counts,
          total,
          progress,
          isToday,
          hasError,
        }
      })
      .filter((x) => {
        if (dayQuickFilter === 'all') return true
        if (dayQuickFilter === 'error') return x.hasError
        if (dayQuickFilter === 'ok') return !x.hasError && x.counts.ok > 0
        if (dayQuickFilter === 'weekly_pending') return x.counts.weeklyPending > 0
        return true
      })
  }, [dailyRows, dayQuickFilter])

  return (
    <>
      {contextHolder}
      <Card
      title="Lịch sử checklist"
      extra={
        <Space wrap direction={isMobile ? 'vertical' : 'horizontal'} style={isMobile ? { width: '100%' } : undefined}>
          <Select
            allowClear
            placeholder="Lọc theo checklist"
            style={{ width: isMobile ? '100%' : 240 }}
            options={catalog.map((c) => ({ label: c.title, value: c.key }))}
            value={checklistKey}
            onChange={(v) => setChecklistKey(v)}
          />
          <DatePicker
            allowClear
            placeholder="Lọc theo ngày kiểm tra"
            format="DD/MM/YYYY"
            value={checkDate}
            onChange={(d) => setCheckDate(d)}
          />
          <Button type="primary" onClick={() => void load(page)}>
            Tải lại
          </Button>
        </Space>
      }
    >
      <Table<HistoryRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        size={isMobile ? 'small' : 'middle'}
        scroll={{ x: 1100 }}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p) => setPage(p),
          showSizeChanger: false,
        }}
        expandable={{
          expandedRowRender: (r) => renderChecklistLikeView(r),
        }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
        Mở rộng từng dòng để xem chi tiết từng mục giống phiếu Word.
      </Typography.Paragraph>
    </Card>
    <Card
      title="Theo dõi checklist theo tuần"
      style={{ marginTop: 16 }}
      extra={
        <Space wrap>
          {isMobile && (
            <Segmented<'list' | 'calendar'>
              size="small"
              value={mobileScheduleView}
              options={[
                { label: 'List', value: 'list' },
                { label: 'Calendar', value: 'calendar' },
              ]}
              onChange={setMobileScheduleView}
            />
          )}
          <DatePicker
            picker="month"
            allowClear={false}
            value={month}
            format="MM/YYYY"
            onChange={(d) => d && setMonth(d)}
          />
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">OK</Tag>
        <Tag color="red">Thiếu</Tag>
        <Tag color="orange">Thiếu tuần</Tag>
        <Tag>N/A</Tag>
      </Space>
      {isMobile && mobileScheduleView === 'list' ? (
        <Space direction="vertical" size="small" style={{ width: '100%' }}>
          <Segmented<'all' | 'error' | 'ok' | 'weekly_pending'>
            size="small"
            value={dayQuickFilter}
            options={[
              { label: 'Tất cả', value: 'all' },
              { label: 'Có lỗi', value: 'error' },
              { label: 'OK', value: 'ok' },
              { label: 'Thiếu tuần', value: 'weekly_pending' },
            ]}
            onChange={setDayQuickFilter}
          />
          {mobileDayCards.map((d) => (
            <Card
              key={d.date.format('YYYY-MM-DD')}
              size="small"
              ref={d.isToday ? todayCardRef : undefined}
              hoverable
              onClick={() => {
                setCheckDate(d.date)
                setPage(1)
              }}
              style={{
                borderColor: d.hasError ? '#fca5a5' : d.isToday ? '#86efac' : '#e5e7eb',
                background: d.hasError ? '#fff7f7' : d.isToday ? '#f6ffed' : '#fff',
                borderRadius: 14,
              }}
            >
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <Typography.Text strong style={{ fontSize: 15 }}>
                    {d.date.format('DD/MM')} - {weekdayShort(d.date)}
                  </Typography.Text>
                  {d.hasError ? <Tag color="red">⚠ Cần chú ý</Tag> : <Tag color="green">Ổn định</Tag>}
                </Space>
                <Progress
                  percent={d.progress}
                  strokeColor={d.hasError ? '#ef4444' : '#16a34a'}
                  trailColor="#e5e7eb"
                  showInfo={false}
                />
                <Space wrap size={[8, 8]}>
                  <Tag color="green">OK {d.counts.ok}</Tag>
                  <Tag color="red">Thiếu {d.counts.missing}</Tag>
                  <Tag color="orange">Thiếu tuần {d.counts.weeklyPending}</Tag>
                  <Tag>N/A {d.counts.na}</Tag>
                </Space>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Tap để lọc lịch sử theo ngày này
                </Typography.Text>
              </Space>
            </Card>
          ))}
        </Space>
      ) : (
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {weekBlocks.map((week) => (
          <Card key={week.key} size="small" title={week.title}>
            <div style={{ overflowX: 'auto', paddingBottom: isMobile ? 4 : 0 }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 8,
                  marginBottom: 8,
                  minWidth: 560,
                }}
              >
                {['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'].map((h) => (
                  <div key={h} style={{ textAlign: 'center', fontWeight: 600, color: '#595959' }}>
                    {h}
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
                  gap: 8,
                  minWidth: 560,
                }}
              >
                {week.days.map((d) => {
                  const isFuture = d.date.isAfter(dayjs(), 'day')
                  const isToday = d.date.isSame(dayjs(), 'day')
                  return (
                    <div
                      key={d.date.format('YYYY-MM-DD')}
                      style={{
                        border: `1px solid ${isToday ? '#52c41a' : '#f0f0f0'}`,
                        borderRadius: 8,
                        padding: 8,
                        minHeight: 114,
                        background: isToday ? '#f6ffed' : '#fff',
                        opacity: isFuture ? 0.55 : 1,
                        boxShadow: isToday ? '0 0 0 1px #b7eb8f inset' : undefined,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                        {d.date.format('DD/MM')}
                      </div>
                      <CompactStatusLine label={resolveAssigneeName('cong-khu-a', d.date)} item={d.a} />
                      <CompactStatusLine label={resolveAssigneeName('cong-khu-b', d.date)} item={d.b} />
                      <CompactStatusLine label={resolveAssigneeName('phong-server', d.date)} item={d.s} />
                    </div>
                  )
                })}
              </div>
            </div>
          </Card>
        ))}
      </Space>
      )}
    </Card>
    </>
  )
}

function renderStatusTag(item?: DailyStatusChecklist) {
  if (!item) return <Tag style={{ marginInlineEnd: 0 }}>N/A</Tag>
  if (item.status === 'checked')
    return <Tag color="green" style={{ marginInlineEnd: 0 }}>{item.completedCount > 1 ? `OK(${item.completedCount})` : 'OK'}</Tag>
  if (item.status === 'not_required') return <Tag style={{ marginInlineEnd: 0 }}>N/A</Tag>
  if (item.status === 'weekly_done') return <Tag color="cyan" style={{ marginInlineEnd: 0 }}>Đủ tuần</Tag>
  if (item.status === 'weekly_pending') return <Tag color="orange" style={{ marginInlineEnd: 0 }}>Thiếu tuần</Tag>
  return <Tag color="red" style={{ marginInlineEnd: 0 }}>Thiếu</Tag>
}

function CompactStatusLine({ label, item }: { label: string; item?: DailyStatusChecklist }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 6 }}>
      <Typography.Text style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography.Text>
      {renderStatusTag(item)}
    </div>
  )
}

function pickChecklistStatus(
  row: DailyStatusRow | undefined,
  catalog: ChecklistDefinition[],
  expectedKey: string,
  fallbackKeyword: string,
) {
  if (!row) return undefined
  const byKey = row.checklists.find((x) => x.checklistKey === expectedKey)
  if (byKey) return byKey

  const matchedKey = catalog.find((c) => c.title.toLowerCase().includes(fallbackKeyword))?.key
  if (!matchedKey) return undefined
  return row.checklists.find((x) => x.checklistKey === matchedKey)
}

function resolveAssigneeName(checklistKey: string, checkDate: Dayjs): string {
  if (checklistKey === 'cong-khu-a') return 'Phạm Ngọc Vỹ'
  if (checklistKey === 'cong-khu-b') return 'Đặng Phi Hùng'

  const day = checkDate.day() // 0: CN, 1: T2, ... 6: T7
  if (day === 1 || day === 2) return 'Chề Long Bảo'
  if (day === 3 || day === 4) return 'Phạm Thanh Tuấn'
  return 'Phan Văn Thìn'
}

function weekdayShort(d: Dayjs): string {
  const map = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  return map[d.day()] ?? ''
}
