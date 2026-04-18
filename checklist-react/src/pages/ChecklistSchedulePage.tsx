import { useEffect, useMemo, useState } from 'react'
import { Card, DatePicker, Segmented, Space, Tag, Tooltip, Typography } from 'antd'
import dayjs, { Dayjs } from 'dayjs'
import { fetchDailyStatus, fetchDefinitions } from '../api/client'
import type { ChecklistDefinition, DailyStatusChecklist, DailyStatusRow } from '../api/types'

type ViewMode = 'month' | 'week' | 'year'

const WEEKDAY_HEADERS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']

export default function ChecklistSchedulePage() {
  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [anchorDate, setAnchorDate] = useState<Dayjs>(dayjs())
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [rows, setRows] = useState<DailyStatusRow[]>([])

  useEffect(() => {
    void (async () => {
      const defs = await fetchDefinitions()
      setCatalog(defs.checklists)
    })()
  }, [])

  useEffect(() => {
    void (async () => {
      const range = getRange(anchorDate, viewMode)
      const res = await fetchDailyStatus({
        fromDate: range.from.format('YYYY-MM-DD'),
        toDate: range.to.format('YYYY-MM-DD'),
      })
      setRows(res.items)
    })()
  }, [anchorDate, viewMode])

  const rowByDate = useMemo(() => {
    const map = new Map<string, DailyStatusRow>()
    for (const row of rows) map.set(dayjs(row.checkDate).format('YYYY-MM-DD'), row)
    return map
  }, [rows])

  const dayCells = useMemo(() => {
    const range = getRange(anchorDate, viewMode)
    const visibleFrom = viewMode === 'month' ? startOfIsoWeek(range.from.startOf('month')) : startOfIsoWeek(range.from)
    const visibleTo = viewMode === 'month' ? endOfIsoWeek(range.to.endOf('month')) : endOfIsoWeek(range.to)
    const items: Dayjs[] = []
    for (let d = visibleFrom; d.isBefore(visibleTo) || d.isSame(visibleTo, 'day'); d = d.add(1, 'day')) {
      items.push(d)
    }
    if (viewMode === 'week') return items.slice(0, 7)
    return items
  }, [anchorDate, viewMode])

  const columns = 7

  return (
    <Card
      title="Lịch checklist tổng quan"
      extra={
        <Space wrap>
          <Segmented<ViewMode>
            value={viewMode}
            onChange={(v) => setViewMode(v)}
            options={[
              { label: 'Tháng', value: 'month' },
              { label: 'Tuần', value: 'week' },
              { label: 'Năm', value: 'year' },
            ]}
          />
          <DatePicker
            picker={viewMode === 'year' ? 'year' : viewMode === 'week' ? 'date' : 'month'}
            allowClear={false}
            value={anchorDate}
            format={viewMode === 'year' ? 'YYYY' : viewMode === 'week' ? 'DD/MM/YYYY' : 'MM/YYYY'}
            onChange={(d) => d && setAnchorDate(d)}
          />
        </Space>
      }
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Tag color="green">OK</Tag>
        <Tag color="red">Thiếu</Tag>
        <Tag color="orange">Thiếu tuần</Tag>
        <Tag color="cyan">Đủ tuần</Tag>
        <Tag>N/A</Tag>
      </Space>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 8,
          marginBottom: 8,
        }}
      >
        {WEEKDAY_HEADERS.map((h) => (
          <div key={h} style={{ textAlign: 'center', fontWeight: 600, color: '#595959' }}>
            {h}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 8,
        }}
      >
        {dayCells.map((date) => {
          const dateKey = date.format('YYYY-MM-DD')
          const row = rowByDate.get(dateKey)
          const inActiveRange = isInActiveRange(date, anchorDate, viewMode)
          const isFuture = date.isAfter(dayjs(), 'day')
          const isToday = date.isSame(dayjs(), 'day')
          const a = pickChecklistStatus(row, catalog, 'cong-khu-a', 'a')
          const b = pickChecklistStatus(row, catalog, 'cong-khu-b', 'b')
          const s = pickChecklistStatus(row, catalog, 'phong-server', 'server')

          return (
            <div
              key={dateKey}
              style={{
                border: `1px solid ${isToday ? '#52c41a' : '#f0f0f0'}`,
                borderRadius: 8,
                padding: 8,
                minHeight: 114,
                background: isToday ? '#f6ffed' : inActiveRange ? '#fff' : '#fafafa',
                opacity: inActiveRange ? (isFuture ? 0.55 : 1) : 0.45,
                boxShadow: isToday ? '0 0 0 1px #b7eb8f inset' : undefined,
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                {date.format('DD/MM')}
              </div>
              <StatusLine label={resolveAssigneeName('cong-khu-a', date)} item={a} />
              <StatusLine label={resolveAssigneeName('cong-khu-b', date)} item={b} />
              <StatusLine label={resolveAssigneeName('phong-server', date)} item={s} />
            </div>
          )
        })}
      </div>

      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        Mỗi ô ngày hiển thị đúng 1 lần cho A/B/S để scan nhanh toàn bộ lịch.
      </Typography.Paragraph>
    </Card>
  )
}

function StatusLine({ label, item }: { label: string; item?: DailyStatusChecklist }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 6 }}>
      <Typography.Text style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</Typography.Text>
      <Tooltip
        title={
          item
            ? `${fullStatusLabel(item.status)}${item.completedCount > 1 ? ` (${item.completedCount} lần)` : ''}`
            : 'Không có dữ liệu'
        }
      >
        {renderStatusTag(item)}
      </Tooltip>
    </div>
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

function fullStatusLabel(status: DailyStatusChecklist['status']) {
  if (status === 'checked') return 'Đã check'
  if (status === 'not_required') return 'Không yêu cầu'
  if (status === 'weekly_done') return 'Đã đủ tuần'
  if (status === 'weekly_pending') return 'Chưa check tuần này'
  return 'Chưa check'
}

function getRange(anchorDate: Dayjs, mode: ViewMode) {
  if (mode === 'week') {
    return {
      from: startOfIsoWeek(anchorDate),
      to: endOfIsoWeek(anchorDate),
    }
  }
  if (mode === 'year') {
    return {
      from: anchorDate.startOf('year'),
      to: anchorDate.endOf('year'),
    }
  }
  return {
    from: anchorDate.startOf('month'),
    to: anchorDate.endOf('month'),
  }
}

function isInActiveRange(date: Dayjs, anchorDate: Dayjs, mode: ViewMode) {
  if (mode === 'week') return date.isSame(startOfIsoWeek(anchorDate), 'day') || (date.isAfter(startOfIsoWeek(anchorDate), 'day') && date.isBefore(endOfIsoWeek(anchorDate), 'day')) || date.isSame(endOfIsoWeek(anchorDate), 'day')
  if (mode === 'year') return date.isSame(anchorDate, 'year')
  return date.isSame(anchorDate, 'month')
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

function startOfIsoWeek(d: Dayjs) {
  const shift = (d.day() + 6) % 7 // Monday = 0 ... Sunday = 6
  return d.startOf('day').subtract(shift, 'day')
}

function endOfIsoWeek(d: Dayjs) {
  return startOfIsoWeek(d).add(6, 'day').endOf('day')
}
