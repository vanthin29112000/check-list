import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Collapse,
  Grid,
  Input,
  Modal,
  Progress,
  Radio,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Typography,
  notification,
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { useNavigate } from 'react-router-dom'
import { fetchCompletionStatus, fetchDefinitions, fetchEmailRecipientsConfig, submitChecklist } from '../api/client'
import type { ChecklistDefinition, ChecklistItemDef } from '../api/types'

type RowData = ChecklistItemDef & { groupTitle: string }

function subStateKey(itemKey: string, subKey: string): string {
  return `${itemKey}::${subKey}`
}

/** Nhãn hiển thị trong dropdown chọn checklist (ngắn gọn, dễ đọc). */
function checklistDropdownLabel(key: string, fallbackTitle: string): string {
  const k = key.toLowerCase()
  if (k === 'cong-khu-a') return 'Kiểm soát ra vào khu A'
  if (k === 'cong-khu-b') return 'Kiểm soát ra vào khu B'
  if (k === 'phong-server') return 'Phòng máy chủ'
  return fallbackTitle
}

export default function ChecklistFormPage() {
  const navigate = useNavigate()
  const { md } = Grid.useBreakpoint()
  const isMobile = !md

  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [checklistKey, setChecklistKey] = useState<string>()
  const [completedTodayByKey, setCompletedTodayByKey] = useState<Record<string, number>>({})
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [configuredEmailByName, setConfiguredEmailByName] = useState<Record<string, string>>({})
  const [checkDate] = useState<Dayjs>(dayjs())

  const [passedByKey, setPassedByKey] = useState<Record<string, boolean | undefined>>({})
  const [subPassedByKey, setSubPassedByKey] = useState<Record<string, boolean | undefined>>({})
  const [noteByKey, setNoteByKey] = useState<Record<string, string>>({})
  const [invalidItemKey, setInvalidItemKey] = useState<string | null>(null)
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)

  const [busy, setBusy] = useState(false)
  const [submitOverlayOpen, setSubmitOverlayOpen] = useState(false)
  const [submitPhaseText, setSubmitPhaseText] = useState('Đang xử lý...')
  const [notiApi, contextHolder] = notification.useNotification()
  const hydratedDraftRef = useRef(false)
  const touchStartXRef = useRef<Record<string, number>>({})

  async function reloadCompletionStatus() {
    const completion = await fetchCompletionStatus({ date: checkDate.format('YYYY-MM-DD') })
    const next: Record<string, number> = {}
    for (const item of completion.items) {
      next[item.checklistKey] = item.completedCount
    }
    setCompletedTodayByKey(next)
    return next
  }

  useEffect(() => {
    void (async () => {
      try {
        const [res, completion] = await Promise.all([
          fetchDefinitions(),
          fetchCompletionStatus({ date: checkDate.format('YYYY-MM-DD') }),
        ])
        setCatalog(res.checklists)
        const completionMap: Record<string, number> = {}
        for (const item of completion.items) {
          completionMap[item.checklistKey] = item.completedCount
        }
        setCompletedTodayByKey(completionMap)

        setChecklistKey((prev) => {
          if (prev && (completionMap[prev] ?? 0) === 0) return prev
          return undefined
        })
      } catch (e) {
        notiApi.error({
          message: 'Không tải được checklist',
          description: String(e),
          placement: 'topRight',
        })
      }
    })()
  }, [notiApi, checkDate])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const cfg = await fetchEmailRecipientsConfig()
        if (cancelled) return
        const map: Record<string, string> = {}
        for (const row of cfg.hrStaff) {
          const name = normalizePersonName(row.displayName)
          const email = String(row.email ?? '').trim()
          if (!name || !email) continue
          map[name] = email
        }
        setConfiguredEmailByName(map)
      } catch {
        /* không chặn thao tác form nếu chưa tải được cấu hình email */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!checklistKey) return
    if ((completedTodayByKey[checklistKey] ?? 0) === 0) return
    setChecklistKey(undefined)
  }, [checklistKey, completedTodayByKey])

  const active = useMemo(() => catalog.find((c) => c.key === checklistKey), [catalog, checklistKey])
  const checklistOptions = useMemo(
    () =>
      catalog.map((c) => {
        const completedCount = completedTodayByKey[c.key] ?? 0
        const isDone = completedCount > 0
        const name = checklistDropdownLabel(c.key, c.title)
        return {
          value: c.key,
          label: isDone ? `${name} (đã làm hôm nay)` : name,
          disabled: isDone,
        }
      }),
    [catalog, completedTodayByKey],
  )
  const hasAnyAvailableChecklist = useMemo(
    () => catalog.some((c) => (completedTodayByKey[c.key] ?? 0) === 0),
    [catalog, completedTodayByKey],
  )

  useEffect(() => {
    setPassedByKey({})
    setSubPassedByKey({})
    setNoteByKey({})
    setInvalidItemKey(null)
    setHasTriedSubmit(false)
    hydratedDraftRef.current = false
  }, [checklistKey])

  useEffect(() => {
    if (!checklistKey) {
      setSubmitterName('')
      setSubmitterEmail('')
      return
    }
    const assignee = resolveAssignee(checklistKey, checkDate)
    setSubmitterName(assignee.name)
    const mapped = configuredEmailByName[normalizePersonName(assignee.name)]
    setSubmitterEmail(mapped || assignee.email)
  }, [checklistKey, checkDate, configuredEmailByName])

  // Khôi phục bản nháp khi user vào checklist/date tương ứng.
  useEffect(() => {
    if (!checklistKey) return
    const key = draftStorageKey(checklistKey, checkDate)
    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        hydratedDraftRef.current = true
        return
      }
      const draft = JSON.parse(raw) as {
        passedByKey?: Record<string, boolean>
        subPassedByKey?: Record<string, boolean>
        noteByKey?: Record<string, string>
      }
      setPassedByKey(draft.passedByKey ?? {})
      setSubPassedByKey(draft.subPassedByKey ?? {})
      setNoteByKey(draft.noteByKey ?? {})
      hydratedDraftRef.current = true
      notiApi.info({
        message: 'Đã khôi phục bản nháp',
        description: 'Hệ thống đã tải lại dữ liệu checklist chưa gửi.',
        placement: 'topRight',
      })
    } catch {
      hydratedDraftRef.current = true
    }
  }, [checklistKey, checkDate, notiApi])

  // Tự động lưu nháp cục bộ (debounce) để tránh mất dữ liệu khi rớt mạng/refresh.
  useEffect(() => {
    if (!checklistKey || !hydratedDraftRef.current) return
    const t = window.setTimeout(() => {
      try {
        const key = draftStorageKey(checklistKey, checkDate)
        const hasAnyData =
          Object.keys(passedByKey).length > 0 ||
          Object.keys(subPassedByKey).length > 0 ||
          Object.keys(noteByKey).some((k) => (noteByKey[k] ?? '').trim().length > 0)
        if (!hasAnyData) {
          localStorage.removeItem(key)
          return
        }
        localStorage.setItem(
          key,
          JSON.stringify({
            passedByKey,
            subPassedByKey,
            noteByKey,
            updatedAt: new Date().toISOString(),
          }),
        )
      } catch {
        // Ignore localStorage errors
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [checklistKey, checkDate, passedByKey, subPassedByKey, noteByKey])

  const sectionBlocks = useMemo(() => {
    if (!active) return []
    return active.groups.map((g) => ({
      groupTitle: g.title,
      icon: pickSectionIcon(g.title),
      data: g.items.map((it) => ({ ...it, groupTitle: g.title })),
    }))
  }, [active])

  const allItems = useMemo(() => sectionBlocks.flatMap((b) => b.data), [sectionBlocks])

  function resolveItemStatus(it: ChecklistItemDef): boolean | undefined {
    if (!it.subchecks?.length) return passedByKey[it.key]
    for (const sc of it.subchecks) {
      if (subPassedByKey[subStateKey(it.key, sc.key)] === undefined) return undefined
    }
    return it.subchecks.every((sc) => subPassedByKey[subStateKey(it.key, sc.key)] === true)
  }

  const summary = useMemo(() => {
    const totalItems = allItems.length
    let passedCount = 0
    let failedCount = 0
    let unansweredCount = 0
    let missingFailedNotes = 0

    for (const it of allItems) {
      const status = resolveItemStatus(it)
      if (status === true) passedCount += 1
      else if (status === false) {
        failedCount += 1
        if (!(noteByKey[it.key] ?? '').trim()) {
          missingFailedNotes += 1
        }
      } else unansweredCount += 1
    }

    return { totalItems, passedCount, failedCount, unansweredCount, missingFailedNotes }
  }, [allItems, passedByKey, subPassedByKey, noteByKey])
  const completedPercent = useMemo(() => {
    if (summary.totalItems <= 0) return 0
    return Math.round(((summary.passedCount + summary.failedCount) / summary.totalItems) * 100)
  }, [summary.totalItems, summary.passedCount, summary.failedCount])

  function scrollToNextItem(itemKey: string) {
    const idx = allItems.findIndex((x) => x.key === itemKey)
    if (idx < 0) return
    const next = allItems[idx + 1]
    if (!next) return
    window.setTimeout(() => {
      const el = document.getElementById(`check-item-${next.key}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 120)
  }

  function setPassed(itemKey: string, passed: boolean) {
    if (invalidItemKey === itemKey) setInvalidItemKey(null)
    setPassedByKey((s) => ({ ...s, [itemKey]: passed }))
  }

  function setNote(itemKey: string, note: string) {
    if (invalidItemKey === itemKey) setInvalidItemKey(null)
    setNoteByKey((s) => ({ ...s, [itemKey]: note }))
  }

  function setSubPassed(itemKey: string, subKey: string, passed: boolean) {
    if (invalidItemKey === itemKey) setInvalidItemKey(null)
    setSubPassedByKey((s) => ({ ...s, [subStateKey(itemKey, subKey)]: passed }))
  }

  function applyItemDecision(itemKey: string, passed: boolean) {
    setPassed(itemKey, passed)
    scrollToNextItem(itemKey)
  }

  function onItemTouchStart(itemKey: string, x: number) {
    touchStartXRef.current[itemKey] = x
  }

  function onItemTouchEnd(itemKey: string, x: number) {
    const start = touchStartXRef.current[itemKey]
    if (typeof start !== 'number') return
    const dx = x - start
    if (Math.abs(dx) < 56) return
    applyItemDecision(itemKey, dx > 0)
  }

  function focusInvalidItem(itemKey: string, focusNote = false) {
    setInvalidItemKey(itemKey)
    const row = document.getElementById(`check-item-${itemKey}`)
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    if (focusNote) {
      window.setTimeout(() => {
        const noteEl = document.getElementById(`check-note-${itemKey}`) as HTMLTextAreaElement | null
        noteEl?.focus()
      }, 250)
    }
  }

  function markSectionAllPass(rows: RowData[]) {
    setPassedByKey((s) => {
      const next = { ...s }
      for (const row of rows) {
        if (!row.subchecks?.length) next[row.key] = true
      }
      return next
    })
    setSubPassedByKey((s) => {
      const next = { ...s }
      for (const row of rows) {
        for (const sc of row.subchecks ?? []) {
          next[subStateKey(row.key, sc.key)] = true
        }
      }
      return next
    })
  }

  function getSectionStats(rows: RowData[]) {
    let pass = 0
    let fail = 0
    let todo = 0
    for (const r of rows) {
      const v = resolveItemStatus(r)
      if (v === true) pass += 1
      else if (v === false) fail += 1
      else todo += 1
    }
    return { pass, fail, todo }
  }

  function buildPayload() {
    if (!active) {
      return { ok: false as const, message: 'Chọn checklist.' }
    }

    if (!submitterName.trim() || !submitterEmail.trim()) {
      return { ok: false as const, message: 'Thiếu thông tin người kiểm tra.' }
    }

    const responses: {
      itemKey: string
      passed: boolean
      note?: string | null
      subchecks?: { key: string; passed: boolean }[]
    }[] = []

    for (const g of active.groups) {
      for (const it of g.items) {
        let status: boolean | undefined
        let subPayload: { key: string; passed: boolean }[] | undefined

        if (it.subchecks?.length) {
          const parts: { key: string; passed: boolean }[] = []
          for (const sc of it.subchecks) {
            const v = subPassedByKey[subStateKey(it.key, sc.key)]
            if (v === undefined) {
              focusInvalidItem(it.key)
              return {
                ok: false as const,
                message: `Chưa chọn đủ ổ đĩa / kiểm tra con: ${it.label} — ${sc.label}`,
              }
            }
            parts.push({ key: sc.key, passed: v })
          }
          subPayload = parts
          status = parts.every((p) => p.passed)
        } else {
          status = passedByKey[it.key]
          if (status === undefined) {
            focusInvalidItem(it.key)
            return { ok: false as const, message: `Chưa chọn Đạt/Không: ${it.label}` }
          }
        }

        const note = (noteByKey[it.key] ?? '').trim()
        if (status === false && !note) {
          focusInvalidItem(it.key, true)
          return { ok: false as const, message: `Mục "${it.label}" đang Không đạt, bắt buộc nhập ghi chú.` }
        }

        responses.push({
          itemKey: it.key,
          passed: status,
          note: note || null,
          subchecks: subPayload,
        })
      }
    }

    return {
      ok: true as const,
      body: {
        checklistKey: active.key,
        submitterName: submitterName.trim(),
        submitterEmail: submitterEmail.trim(),
        checkDate: checkDate.format('YYYY-MM-DD'),
        responses,
      },
    }
  }

  async function submitFinal() {
    if (busy) return
    const payload = buildPayload()
    if (!payload.ok) {
      notiApi.error({
        message: 'Gửi thất bại, vui lòng thử lại',
        description: payload.message,
        placement: 'topRight',
      })
      return
    }

    setBusy(true)
    setSubmitOverlayOpen(true)
    setSubmitPhaseText('Đang lưu checklist...')
    try {
      const res = await submitChecklist(payload.body, (phase) => {
        setSubmitPhaseText(phase === 'save' ? 'Đang lưu checklist...' : 'Đang gửi email thông báo...')
      })
      const sentAt = dayjs().format('DD/MM/YYYY HH:mm')
      try {
        await reloadCompletionStatus()
      } catch {
        // Bỏ qua lỗi reload trạng thái để không ảnh hưởng kết quả submit thành công.
      }
      if (checklistKey) {
        localStorage.removeItem(draftStorageKey(checklistKey, checkDate))
      }
      setPassedByKey({})
      setSubPassedByKey({})
      setNoteByKey({})
      setInvalidItemKey(null)
      setHasTriedSubmit(false)
      notiApi.success({
        message: 'Gửi checklist thành công',
        description: `Đã gửi email • Tổng lỗi: ${res.totalErrors} • ${sentAt}`,
        placement: 'topRight',
        duration: 4,
      })
      navigate('/dashboard')
    } catch (e: unknown) {
      const ax = e as { response?: { data?: { error?: string } }; message?: string }
      const msg = ax.response?.data?.error ?? ax.message ?? String(e)
      const isDup = typeof msg === 'string' && msg.includes('DUPLICATE')
      notiApi.error({
        message: isDup ? 'Đã gửi checklist cho ca này' : 'Gửi thất bại, vui lòng thử lại',
        description: isDup ? msg.replace(/^DUPLICATE:/, '') : msg,
        placement: 'topRight',
      })
    } finally {
      setBusy(false)
      setSubmitOverlayOpen(false)
    }
  }

  function openConfirmBeforeSubmit() {
    setHasTriedSubmit(true)
    const payload = buildPayload()
    if (!payload.ok) {
      notiApi.warning({
        message: 'Checklist chưa hoàn chỉnh',
        description: payload.message,
        placement: 'topRight',
      })
      return
    }

    Modal.confirm({
      title: 'Bạn đã hoàn tất checklist?',
      content: (
        <Space direction="vertical" size={4}>
          <Typography.Text>Tổng mục: {summary.totalItems}</Typography.Text>
          <Typography.Text type={summary.failedCount > 0 ? 'danger' : undefined}>
            Không đạt: {summary.failedCount}
          </Typography.Text>
          <Typography.Text>Đạt: {summary.passedCount}</Typography.Text>
        </Space>
      ),
      okText: 'Xác nhận gửi',
      cancelText: 'Kiểm tra lại',
      onOk: () => submitFinal(),
    })
  }

  const tableColumns: ColumnsType<RowData> = [
    {
      title: 'Thiết bị',
      dataIndex: 'label',
      width: 300,
      render: (t: string) => <Typography.Text strong>{t}</Typography.Text>,
    },
    {
      title: 'Tiêu chuẩn',
      dataIndex: 'standard',
      width: 340,
      render: (value: string) => <Typography.Text>{value}</Typography.Text>,
    },
    {
      title: 'Kiểm tra',
      key: 'check',
      width: 280,
      render: (_, r) =>
        r.subchecks?.length ? (
          <Space direction="vertical" size="small" style={{ width: '100%' }}>
            {r.subchecks.map((sc) => (
              <div key={sc.key}>
                <Typography.Text style={{ display: 'block', marginBottom: 4 }}>{sc.label}</Typography.Text>
                <Radio.Group
                  size="small"
                  value={
                    subPassedByKey[subStateKey(r.key, sc.key)] === undefined
                      ? undefined
                      : subPassedByKey[subStateKey(r.key, sc.key)]
                        ? 'pass'
                        : 'fail'
                  }
                  onChange={(e) => setSubPassed(r.key, sc.key, e.target.value === 'pass')}
                >
                  <Radio value="pass">Đạt</Radio>
                  <Radio value="fail">Không</Radio>
                </Radio.Group>
              </div>
            ))}
          </Space>
        ) : (
          <Radio.Group
            value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
            onChange={(e) => setPassed(r.key, e.target.value === 'pass')}
          >
            <Radio value="pass">Đạt</Radio>
            <Radio value="fail">Không</Radio>
          </Radio.Group>
        ),
    },
    {
      title: 'Ghi chú',
      key: 'note',
      render: (_, r) => {
        const isFail = passedByKey[r.key] === false
        return (
          <Input.TextArea
            id={`check-note-${r.key}`}
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={noteByKey[r.key] ?? ''}
            status={isFail && (!(noteByKey[r.key] ?? '').trim() || invalidItemKey === r.key) ? 'error' : undefined}
            placeholder={isFail ? 'Bắt buộc ghi chú khi Không đạt' : 'Ghi chú (nếu cần)'}
            onChange={(e) => setNote(r.key, e.target.value)}
          />
        )
      },
    },
  ]

  const canSubmitMobile = Boolean(
    active && summary.totalItems > 0 && hasAnyAvailableChecklist && summary.unansweredCount === 0,
  )

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%', paddingBottom: isMobile ? 110 : 0 }}>
      <Modal
        open={submitOverlayOpen}
        footer={null}
        closable={false}
        maskClosable={false}
        centered
        zIndex={2000}
        styles={{ body: { padding: '28px 32px', textAlign: 'center' } }}
      >
        <Spin size="large" />
        <Typography.Paragraph style={{ marginTop: 20, marginBottom: 0 }} strong>
          {submitPhaseText}
        </Typography.Paragraph>
        <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 13 }}>
          Vui lòng đợi, không đóng trình duyệt.
        </Typography.Text>
      </Modal>
      {contextHolder}
      <Card title="Thông tin phiên checklist" styles={{ body: { background: '#fafafa' } }}>
        <Row gutter={[12, 12]}>
          <Col xs={24} md={12} lg={6}>
            <Typography.Text strong>Checklist</Typography.Text>
            <Select
              style={{ width: '100%', marginTop: 8 }}
              options={checklistOptions}
              value={checklistKey}
              onChange={(v) => setChecklistKey(v)}
              placeholder="Chọn checklist"
            />
          </Col>
          <Col xs={24} md={12} lg={6}>
            <Typography.Text strong>Người kiểm tra</Typography.Text>
            <Input style={{ marginTop: 8 }} value={submitterName} readOnly />
          </Col>
        </Row>
      </Card>
      {!hasAnyAvailableChecklist && (
        <Alert
          type="info"
          showIcon
          message="Hôm nay tất cả checklist đã hoàn thành."
          description="Bạn có thể xem lại kết quả ở màn hình Lịch sử."
        />
      )}
      {hasAnyAvailableChecklist && !checklistKey && (
        <Alert
          type="warning"
          showIcon
          message="Vui lòng chọn checklist trước khi thao tác."
          description="Chọn checklist ở dropdown phía trên để bắt đầu kiểm tra."
        />
      )}

      {isMobile && (
        <Card size="small" className="mobile-sticky-overview">
          <Space direction="vertical" style={{ width: '100%' }} size={6}>
            <Typography.Text strong>{active ? checklistDropdownLabel(active.key, active.title) : 'Chọn checklist'}</Typography.Text>
            <Typography.Text type="secondary">
              Bạn đã kiểm tra {summary.passedCount + summary.failedCount}/{summary.totalItems || 0} mục
            </Typography.Text>
            <Progress
              percent={completedPercent}
              strokeColor={summary.failedCount > 0 ? '#ef4444' : '#16a34a'}
              trailColor="#e5e7eb"
              showInfo
            />
            <Button
              type="primary"
              block
              onClick={openConfirmBeforeSubmit}
              disabled={!active || summary.totalItems === 0 || !hasAnyAvailableChecklist}
            >
              Gửi nhanh
            </Button>
            <div className="mobile-stats-grid">
              <div>
                <Typography.Text type="secondary">Tổng</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0 }}>{summary.totalItems}</Typography.Title>
              </div>
              <div>
                <Typography.Text type="secondary">Đạt</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0, color: '#16a34a' }}>{summary.passedCount}</Typography.Title>
              </div>
              <div>
                <Typography.Text type="secondary">Lỗi</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0, color: '#dc2626' }}>{summary.failedCount}</Typography.Title>
              </div>
              <div>
                <Typography.Text type="secondary">Chưa chọn</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0, color: '#6b7280' }}>{summary.unansweredCount}</Typography.Title>
              </div>
            </div>
          </Space>
        </Card>
      )}

      <Card size="small" title="Tổng quan trước khi gửi">
        <Space wrap size={16}>
          <Typography.Text>Tổng mục: {summary.totalItems}</Typography.Text>
          <Typography.Text type="success">Đạt: {summary.passedCount}</Typography.Text>
          <Typography.Text type={summary.failedCount > 0 ? 'danger' : undefined}>Không đạt: {summary.failedCount}</Typography.Text>
          <Typography.Text type={summary.unansweredCount > 0 ? 'secondary' : undefined}>Chưa chọn: {summary.unansweredCount}</Typography.Text>
          <Button size="small" onClick={() => {
            if (!checklistKey) return
            localStorage.removeItem(draftStorageKey(checklistKey, checkDate))
            setPassedByKey({})
            setSubPassedByKey({})
            setNoteByKey({})
            setInvalidItemKey(null)
            setHasTriedSubmit(false)
            notiApi.success({
              message: 'Đã xóa bản nháp',
              description: 'Dữ liệu checklist cục bộ đã được xóa.',
              placement: 'topRight',
            })
          }}>
            Xóa bản nháp
          </Button>
        </Space>
        {summary.failedCount > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginTop: 12 }}
            message={`Có ${summary.failedCount} mục không đạt. Hãy kiểm tra đầy đủ ghi chú trước khi gửi.`}
          />
        )}
      </Card>

      {sectionBlocks.map((block, blockIdx) => {
        const sectionLabel = block.groupTitle.trim() || 'Kiểm tra'
        return (
        <Card
          key={`${checklistKey ?? 'ck'}-${blockIdx}`}
          title={`${block.icon} ${sectionLabel}`}
          size="small"
          styles={{ body: { background: '#fcfcfc' } }}
          extra={
            <Button size="small" onClick={() => markSectionAllPass(block.data)}>
              Đạt tất cả
            </Button>
          }
        >
          {md ? (
            <Table<RowData>
              rowKey={(r) => r.key}
              pagination={false}
              size="middle"
              columns={tableColumns}
              dataSource={block.data}
              bordered
              rowClassName={(r) => {
                const st = resolveItemStatus(r)
                const isMissingStatus = hasTriedSubmit && st === undefined
                const isFail = st === false
                const isInvalid = invalidItemKey === r.key
                if (isInvalid || isMissingStatus) return 'row-invalid'
                if (isFail) return 'row-fail'
                return ''
              }}
              onRow={(r) => ({ id: `check-item-${r.key}` })}
            />
          ) : (
            <Collapse
              size="small"
              defaultActiveKey={[]}
              items={[
                {
                  key: 'items',
                  label: (() => {
                    const s = getSectionStats(block.data)
                    const lab = block.groupTitle.trim() || 'Kiểm tra'
                    return `${lab} • Đạt ${s.pass} • Lỗi ${s.fail} • Chưa chọn ${s.todo}`
                  })(),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      {block.data.map((r) => {
                        const st = resolveItemStatus(r)
                        const isFail = st === false
                        const isMissing = hasTriedSubmit && st === undefined
                        return (
                          <Card
                            key={r.key}
                            id={`check-item-${r.key}`}
                            size="small"
                            className={`mobile-item-card ${st === true ? 'is-pass' : st === false ? 'is-fail' : ''}`}
                            style={{
                              borderColor: invalidItemKey === r.key || isMissing ? '#ff4d4f' : isFail ? '#ff4d4f' : '#f0f0f0',
                              background: invalidItemKey === r.key || isFail ? '#fff2f0' : st === true ? '#f0fdf4' : '#fff',
                              borderRadius: 14,
                            }}
                            onTouchStart={(e) => onItemTouchStart(r.key, e.changedTouches[0]?.clientX ?? 0)}
                            onTouchEnd={(e) => onItemTouchEnd(r.key, e.changedTouches[0]?.clientX ?? 0)}
                          >
                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                              <Typography.Text strong>
                                {st === true ? '✔ ' : st === false ? '✖ ' : ''}
                                {r.label}
                              </Typography.Text>
                              <Typography.Text type="secondary">{r.standard}</Typography.Text>
                              {r.subchecks?.length ? (
                                <Space direction="vertical" style={{ width: '100%' }} size={6}>
                                  <Typography.Text type="secondary">Kiểm tra từng ổ / mục:</Typography.Text>
                                  {r.subchecks.map((sc) => (
                                    <div key={sc.key}>
                                      <Typography.Text style={{ display: 'block', marginBottom: 4 }}>{sc.label}</Typography.Text>
                                      <Radio.Group
                                        optionType="button"
                                        buttonStyle="solid"
                                        className="mobile-toggle-group"
                                        style={{ display: 'flex', width: '100%' }}
                                        value={
                                          subPassedByKey[subStateKey(r.key, sc.key)] === undefined
                                            ? undefined
                                            : subPassedByKey[subStateKey(r.key, sc.key)]
                                              ? 'pass'
                                              : 'fail'
                                        }
                                        onChange={(e) => {
                                          setSubPassed(r.key, sc.key, e.target.value === 'pass')
                                          scrollToNextItem(r.key)
                                        }}
                                      >
                                        <Radio className="mobile-pass-radio" style={{ flex: 1, textAlign: 'center' }} value="pass">
                                          Đạt
                                        </Radio>
                                        <Radio className="mobile-fail-radio" style={{ flex: 1, textAlign: 'center' }} value="fail">
                                          Không
                                        </Radio>
                                      </Radio.Group>
                                    </div>
                                  ))}
                                </Space>
                              ) : (
                                <Radio.Group
                                  optionType="button"
                                  buttonStyle="solid"
                                  className="mobile-toggle-group"
                                  style={{ display: 'flex', width: '100%' }}
                                  value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
                                  onChange={(e) => applyItemDecision(r.key, e.target.value === 'pass')}
                                >
                                  <Radio className="mobile-pass-radio" style={{ flex: 1, textAlign: 'center' }} value="pass">
                                    Đạt
                                  </Radio>
                                  <Radio className="mobile-fail-radio" style={{ flex: 1, textAlign: 'center' }} value="fail">
                                    Không
                                  </Radio>
                                </Radio.Group>
                              )}
                              {isFail ? (
                                <Input.TextArea
                                  id={`check-note-${r.key}`}
                                  autoSize={{ minRows: 2, maxRows: 4 }}
                                  value={noteByKey[r.key] ?? ''}
                                  status={(!(noteByKey[r.key] ?? '').trim() || invalidItemKey === r.key) ? 'error' : undefined}
                                  placeholder="Nhập lỗi / vấn đề gặp phải"
                                  onChange={(e) => setNote(r.key, e.target.value)}
                                />
                              ) : null}
                              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Vuốt phải để chọn Đạt · Vuốt trái để chọn Không
                              </Typography.Text>
                            </Space>
                          </Card>
                        )
                      })}
                    </Space>
                  ),
                },
              ]}
            />
          )}
        </Card>
        )
      })}

      {isMobile ? (
        <div className="mobile-submit-bar">
          <div className="mobile-submit-summary">
            <span>Tổng: {summary.totalItems}</span>
            <span>Lỗi: {summary.failedCount}</span>
            <span>Chưa chọn: {summary.unansweredCount}</span>
          </div>
          <Button
            type="primary"
            size="large"
            block
            onClick={openConfirmBeforeSubmit}
            loading={busy}
            disabled={!canSubmitMobile}
          >
            {busy ? 'Đang gửi...' : 'Gửi checklist'}
          </Button>
        </div>
      ) : (
        <Button
          type="primary"
          size="large"
          onClick={openConfirmBeforeSubmit}
          loading={busy}
          disabled={!canSubmitMobile}
        >
          {busy ? 'Đang gửi...' : 'Gửi checklist'}
        </Button>
      )}

      <style>{`
        .row-fail td {
          background: #fff2f0 !important;
        }
        .row-invalid td {
          background: #fff1f0 !important;
          box-shadow: inset 0 0 0 1px #ff4d4f;
        }
        .mobile-submit-bar {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 20;
          background: #fff;
          border-top: 1px solid #f0f0f0;
          box-shadow: 0 -6px 12px rgba(0, 0, 0, 0.06);
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
        }
        .mobile-submit-summary {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #595959;
          margin-bottom: 8px;
        }
        .mobile-sticky-overview {
          position: sticky;
          top: 8px;
          z-index: 12;
          border-radius: 16px;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        }
        .mobile-stats-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 8px;
          padding-top: 4px;
        }
        .mobile-item-card {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .mobile-item-card.is-pass {
          box-shadow: 0 0 0 1px #86efac inset;
        }
        .mobile-item-card.is-fail {
          box-shadow: 0 0 0 1px #fca5a5 inset;
        }
        .mobile-toggle-group .ant-radio-button-wrapper {
          min-height: 42px;
          line-height: 40px;
          font-weight: 600;
        }
        .mobile-toggle-group .mobile-pass-radio.ant-radio-button-wrapper-checked {
          background: #16a34a;
          border-color: #16a34a;
          color: #fff;
        }
        .mobile-toggle-group .mobile-fail-radio.ant-radio-button-wrapper-checked {
          background: #dc2626;
          border-color: #dc2626;
          color: #fff;
        }
      `}</style>
    </Space>
  )
}

function pickSectionIcon(title: string) {
  const lower = title.toLowerCase()
  if (lower.includes('server')) return '🖥️'
  if (lower.includes('camera')) return '📷'
  if (lower.includes('mạng') || lower.includes('network')) return '🌐'
  if (lower.includes('điện') || lower.includes('ups')) return '🔌'
  return '🧩'
}

function normalizePersonName(s: string): string {
  return String(s ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

function resolveAssignee(checklistKey: string, checkDate: Dayjs): { name: string; email: string } {
  // Rule mặc định theo yêu cầu vận hành
  if (checklistKey === 'cong-khu-a') {
    return { name: 'Phạm Ngọc Vỹ', email: 'pham.ngoc.vy@demo.local' }
  }
  if (checklistKey === 'cong-khu-b') {
    return { name: 'Đặng Phi Hùng', email: 'dang.phi.hung@demo.local' }
  }

  // Daily checklist (phòng server) theo thứ:
  // Thứ 2-3: Chề Long Bảo, Thứ 4-5: Phạm Thanh Tuấn, Thứ 6-7: Phan Văn Thìn
  const day = checkDate.day() // 0: CN, 1: T2, ... 6: T7
  if (day === 1 || day === 2) {
    return { name: 'Chề Long Bảo', email: 'clbao@ktxhcm.edu.vn' }
  }
  if (day === 3 || day === 4) {
    return { name: 'Phạm Thanh Tuấn', email: 'pham.thanh.tuan@demo.local' }
  }
  return { name: 'Phan Văn Thìn', email: 'pvthin@ktxhcm.edu.vn' }
}

function draftStorageKey(checklistKey: string, checkDate: Dayjs) {
  return `checklist-draft:${checklistKey}:${checkDate.format('YYYY-MM-DD')}`
}
