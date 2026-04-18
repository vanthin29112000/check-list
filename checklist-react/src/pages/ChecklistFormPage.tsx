import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Collapse, Grid, Input, Modal, Radio, Row, Select, Space, Table, Typography, notification } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import dayjs, { Dayjs } from 'dayjs'
import { fetchCompletionStatus, fetchDefinitions, submitChecklist } from '../api/client'
import type { ChecklistDefinition, ChecklistItemDef } from '../api/types'

type RowData = ChecklistItemDef & { groupTitle: string }

export default function ChecklistFormPage() {
  const { md } = Grid.useBreakpoint()
  const isMobile = !md

  const [catalog, setCatalog] = useState<ChecklistDefinition[]>([])
  const [checklistKey, setChecklistKey] = useState<string>()
  const [completedTodayByKey, setCompletedTodayByKey] = useState<Record<string, number>>({})
  const [submitterName, setSubmitterName] = useState('')
  const [submitterEmail, setSubmitterEmail] = useState('')
  const [checkDate] = useState<Dayjs>(dayjs())

  const [passedByKey, setPassedByKey] = useState<Record<string, boolean | undefined>>({})
  const [noteByKey, setNoteByKey] = useState<Record<string, string>>({})
  const [invalidItemKey, setInvalidItemKey] = useState<string | null>(null)
  const [hasTriedSubmit, setHasTriedSubmit] = useState(false)

  const [busy, setBusy] = useState(false)
  const [notiApi, contextHolder] = notification.useNotification()
  const hydratedDraftRef = useRef(false)

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

        if (res.checklists.length > 0) {
          setChecklistKey((prev) => {
            if (prev && (completionMap[prev] ?? 0) === 0) return prev
            const firstAvailable = res.checklists.find((c) => (completionMap[c.key] ?? 0) === 0)
            return firstAvailable?.key
          })
        }
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
    if (!catalog.length) return
    if (checklistKey && (completedTodayByKey[checklistKey] ?? 0) === 0) return
    const firstAvailable = catalog.find((c) => (completedTodayByKey[c.key] ?? 0) === 0)
    setChecklistKey(firstAvailable?.key)
  }, [catalog, checklistKey, completedTodayByKey])

  const active = useMemo(() => catalog.find((c) => c.key === checklistKey), [catalog, checklistKey])
  const checklistOptions = useMemo(
    () =>
      catalog.map((c) => {
        const completedCount = completedTodayByKey[c.key] ?? 0
        const isDone = completedCount > 0
        return {
          value: c.key,
          label: isDone ? `${c.title} (đã làm hôm nay)` : c.title,
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
    setNoteByKey({})
    setInvalidItemKey(null)
    setHasTriedSubmit(false)
    hydratedDraftRef.current = false
  }, [checklistKey])

  useEffect(() => {
    if (!checklistKey) return
    const assignee = resolveAssignee(checklistKey, checkDate)
    setSubmitterName(assignee.name)
    setSubmitterEmail(assignee.email)
  }, [checklistKey, checkDate])

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
      const draft = JSON.parse(raw) as { passedByKey?: Record<string, boolean>; noteByKey?: Record<string, string> }
      setPassedByKey(draft.passedByKey ?? {})
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
          Object.keys(noteByKey).some((k) => (noteByKey[k] ?? '').trim().length > 0)
        if (!hasAnyData) {
          localStorage.removeItem(key)
          return
        }
        localStorage.setItem(
          key,
          JSON.stringify({
            passedByKey,
            noteByKey,
            updatedAt: new Date().toISOString(),
          }),
        )
      } catch {
        // Ignore localStorage errors
      }
    }, 300)
    return () => window.clearTimeout(t)
  }, [checklistKey, checkDate, passedByKey, noteByKey])

  const sectionBlocks = useMemo(() => {
    if (!active) return []
    return active.groups.map((g) => ({
      groupTitle: g.title,
      icon: pickSectionIcon(g.title),
      data: g.items.map((it) => ({ ...it, groupTitle: g.title })),
    }))
  }, [active])

  const allItems = useMemo(() => sectionBlocks.flatMap((b) => b.data), [sectionBlocks])

  const summary = useMemo(() => {
    const totalItems = allItems.length
    let passedCount = 0
    let failedCount = 0
    let unansweredCount = 0
    let missingFailedNotes = 0

    for (const it of allItems) {
      const status = passedByKey[it.key]
      if (status === true) passedCount += 1
      else if (status === false) {
        failedCount += 1
        if (!(noteByKey[it.key] ?? '').trim()) {
          missingFailedNotes += 1
        }
      } else unansweredCount += 1
    }

    return { totalItems, passedCount, failedCount, unansweredCount, missingFailedNotes }
  }, [allItems, passedByKey, noteByKey])

  function setPassed(itemKey: string, passed: boolean) {
    if (invalidItemKey === itemKey) setInvalidItemKey(null)
    setPassedByKey((s) => ({ ...s, [itemKey]: passed }))
  }

  function setNote(itemKey: string, note: string) {
    if (invalidItemKey === itemKey) setInvalidItemKey(null)
    setNoteByKey((s) => ({ ...s, [itemKey]: note }))
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
      for (const row of rows) next[row.key] = true
      return next
    })
  }

  function getSectionStats(rows: RowData[]) {
    let pass = 0
    let fail = 0
    let todo = 0
    for (const r of rows) {
      const v = passedByKey[r.key]
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
        const status = passedByKey[it.key]
        if (status === undefined) {
          focusInvalidItem(it.key)
          return { ok: false as const, message: `Chưa chọn Đạt/Không: ${it.label}` }
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
          // Giữ nguyên data structure: item có subcheck thì gửi đủ subcheck.
          // UX đơn giản: kết quả subcheck theo kết quả Đạt/Không của item.
          subchecks: it.subchecks?.map((sc) => ({ key: sc.key, passed: status })),
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
    try {
      const res = await submitChecklist(payload.body)
      const sentAt = dayjs().format('DD/MM/YYYY HH:mm')
      try {
        await reloadCompletionStatus()
      } catch {
        // Bỏ qua lỗi reload trạng thái để không ảnh hưởng kết quả submit thành công.
      }
      notiApi.success({
        message: 'Gửi checklist thành công',
        description: `Tổng lỗi: ${res.totalErrors} • Thời gian: ${sentAt}`,
        placement: 'topRight',
        duration: 5,
      })
      if (checklistKey) {
        localStorage.removeItem(draftStorageKey(checklistKey, checkDate))
      }
      // Reset trạng thái form sau khi gửi thành công để tránh submit trùng.
      setPassedByKey({})
      setNoteByKey({})
      setInvalidItemKey(null)
      setHasTriedSubmit(false)
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
      onOk: () => void submitFinal(),
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
      width: 360,
      render: (value: string, r) => (
        <Space direction="vertical" size={2}>
          <Typography.Text>{value}</Typography.Text>
          {r.subchecks?.length ? (
            <Typography.Text type="secondary">Chi tiết: {r.subchecks.map((s) => s.label).join('; ')}</Typography.Text>
          ) : null}
        </Space>
      ),
    },
    {
      title: 'Kiểm tra',
      key: 'check',
      width: 190,
      render: (_, r) => (
        <Radio.Group
          value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
          onChange={(e) => setPassed(r.key, e.target.value === 'pass')}
        >
          <Radio value="pass">Đạt</Radio>
          <Radio value="fail">Không đạt</Radio>
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

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
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

      <Card size="small" title="Tổng quan trước khi gửi">
        <Space wrap size={16}>
          <Typography.Text>Tổng mục: {summary.totalItems}</Typography.Text>
          <Typography.Text type={summary.failedCount > 0 ? 'danger' : undefined}>Không đạt: {summary.failedCount}</Typography.Text>
          <Typography.Text>Đạt: {summary.passedCount}</Typography.Text>
          <Typography.Text type={summary.unansweredCount > 0 ? 'warning' : undefined}>
            Chưa chọn: {summary.unansweredCount}
          </Typography.Text>
          <Button
            size="small"
            onClick={() => {
              if (!checklistKey) return
              localStorage.removeItem(draftStorageKey(checklistKey, checkDate))
              setPassedByKey({})
              setNoteByKey({})
              setInvalidItemKey(null)
              setHasTriedSubmit(false)
              notiApi.success({
                message: 'Đã xóa bản nháp',
                description: 'Dữ liệu checklist cục bộ đã được xóa.',
                placement: 'topRight',
              })
            }}
          >
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

      {sectionBlocks.map((block) => (
        <Card
          key={block.groupTitle}
          title={`${block.icon} ${block.groupTitle}`}
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
                const isMissingStatus = hasTriedSubmit && passedByKey[r.key] === undefined
                const isFail = passedByKey[r.key] === false
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
              defaultActiveKey={['items']}
              items={[
                {
                  key: 'items',
                  label: (() => {
                    const s = getSectionStats(block.data)
                    return `${block.groupTitle} • Đạt ${s.pass} • Lỗi ${s.fail} • Chưa chọn ${s.todo}`
                  })(),
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }} size="small">
                      {block.data.map((r) => {
                        const isFail = passedByKey[r.key] === false
                        return (
                          <Card
                            key={r.key}
                            id={`check-item-${r.key}`}
                            size="small"
                            style={{
                              borderColor: invalidItemKey === r.key || (hasTriedSubmit && passedByKey[r.key] === undefined) ? '#ff4d4f' : isFail ? '#ff4d4f' : '#f0f0f0',
                              background: invalidItemKey === r.key || isFail ? '#fff2f0' : '#fff',
                            }}
                          >
                            <Space direction="vertical" style={{ width: '100%' }} size={8}>
                              <Typography.Text strong>{r.label}</Typography.Text>
                              <Typography.Text type="secondary">{r.standard}</Typography.Text>
                              {r.subchecks?.length ? (
                                <Typography.Text type="secondary">
                                  Chi tiết: {r.subchecks.map((s) => s.label).join('; ')}
                                </Typography.Text>
                              ) : null}
                              <Radio.Group
                                optionType="button"
                                buttonStyle="solid"
                                style={{ display: 'flex', width: '100%' }}
                                value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
                                onChange={(e) => setPassed(r.key, e.target.value === 'pass')}
                              >
                                <Radio style={{ flex: 1, textAlign: 'center' }} value="pass">
                                  Đạt
                                </Radio>
                                <Radio style={{ flex: 1, textAlign: 'center' }} value="fail">
                                  Không đạt
                                </Radio>
                              </Radio.Group>
                              <Input.TextArea
                                id={`check-note-${r.key}`}
                                autoSize={{ minRows: 2, maxRows: 4 }}
                                value={noteByKey[r.key] ?? ''}
                                status={isFail && (!(noteByKey[r.key] ?? '').trim() || invalidItemKey === r.key) ? 'error' : undefined}
                                placeholder={isFail ? 'Bắt buộc ghi chú khi Không đạt' : 'Ghi chú (nếu cần)'}
                                onChange={(e) => setNote(r.key, e.target.value)}
                              />
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
      ))}

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
            disabled={!active || summary.totalItems === 0 || !hasAnyAvailableChecklist}
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
          disabled={!active || summary.totalItems === 0 || !hasAnyAvailableChecklist}
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
          position: sticky;
          bottom: 0;
          z-index: 20;
          background: #fff;
          border-top: 1px solid #f0f0f0;
          box-shadow: 0 -6px 12px rgba(0, 0, 0, 0.06);
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
          margin: 0 -8px;
        }
        .mobile-submit-summary {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: #595959;
          margin-bottom: 8px;
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
    return { name: 'Chề Long Bảo', email: 'che.long.bao@demo.local' }
  }
  if (day === 3 || day === 4) {
    return { name: 'Phạm Thanh Tuấn', email: 'pham.thanh.tuan@demo.local' }
  }
  return { name: 'Phan Văn Thìn', email: 'pvthin@ktxhcm.edu.vn' }
}

function draftStorageKey(checklistKey: string, checkDate: Dayjs) {
  return `checklist-draft:${checklistKey}:${checkDate.format('YYYY-MM-DD')}`
}
