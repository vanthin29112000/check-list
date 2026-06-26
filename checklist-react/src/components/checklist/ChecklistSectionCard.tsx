import { Button, Card, Collapse, Input, Radio, Space, Table, Tag, Typography } from 'antd'
import type { ColumnsType } from 'antd/es/table'
import type { ChecklistItemDef } from '../../api/types'

export type RowData = ChecklistItemDef & { groupTitle: string }

export function subStateKey(itemKey: string, subKey: string): string {
  return `${itemKey}::${subKey}`
}

interface SectionStats {
  pass: number
  fail: number
  todo: number
}

interface ChecklistSectionCardProps {
  sectionId: string
  groupTitle: string
  icon: string
  data: RowData[]
  isDesktop: boolean
  stats: SectionStats
  passedByKey: Record<string, boolean | undefined>
  subPassedByKey: Record<string, boolean | undefined>
  noteByKey: Record<string, string>
  invalidItemKey: string | null
  hasTriedSubmit: boolean
  resolveItemStatus: (it: ChecklistItemDef) => boolean | undefined
  onMarkAllPass: () => void
  onSetPassed: (itemKey: string, passed: boolean) => void
  onSetSubPassed: (itemKey: string, subKey: string, passed: boolean) => void
  onSetNote: (itemKey: string, note: string) => void
  onApplyItemDecision: (itemKey: string, passed: boolean) => void
  onItemTouchStart: (itemKey: string, x: number) => void
  onItemTouchEnd: (itemKey: string, x: number) => void
  onScrollToNext: (itemKey: string) => void
}

function SubcheckPanel({
  itemKey,
  subchecks,
  subPassedByKey,
  onSetSubPassed,
}: {
  itemKey: string
  subchecks: NonNullable<ChecklistItemDef['subchecks']>
  subPassedByKey: Record<string, boolean | undefined>
  onSetSubPassed: (itemKey: string, subKey: string, passed: boolean) => void
}) {
  return (
    <div
      style={{
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: '10px 12px',
        marginTop: 4,
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
        Kiểm tra chi tiết:
      </Typography.Text>
      <Space direction="vertical" size="small" style={{ width: '100%' }}>
        {subchecks.map((sc) => (
          <div key={sc.key}>
            <Typography.Text style={{ display: 'block', marginBottom: 4, fontSize: 13 }}>
              {sc.label}
            </Typography.Text>
            <Radio.Group
              size="small"
              value={
                subPassedByKey[subStateKey(itemKey, sc.key)] === undefined
                  ? undefined
                  : subPassedByKey[subStateKey(itemKey, sc.key)]
                    ? 'pass'
                    : 'fail'
              }
              onChange={(e) => onSetSubPassed(itemKey, sc.key, e.target.value === 'pass')}
            >
              <Radio value="pass">Đạt</Radio>
              <Radio value="fail">Không</Radio>
            </Radio.Group>
          </div>
        ))}
      </Space>
    </div>
  )
}

export function ChecklistSectionCard({
  sectionId,
  groupTitle,
  icon,
  data,
  isDesktop,
  stats,
  passedByKey,
  subPassedByKey,
  noteByKey,
  invalidItemKey,
  hasTriedSubmit,
  resolveItemStatus,
  onMarkAllPass,
  onSetPassed,
  onSetSubPassed,
  onSetNote,
  onApplyItemDecision,
  onItemTouchStart,
  onItemTouchEnd,
  onScrollToNext,
}: ChecklistSectionCardProps) {
  const sectionLabel = groupTitle.trim() || 'Kiểm tra'

  const tableColumns: ColumnsType<RowData> = [
    {
      title: 'Thiết bị',
      dataIndex: 'label',
      width: '38%',
      render: (t: string, r) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{t}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {r.standard}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: 'Kiểm tra',
      key: 'check',
      width: '32%',
      render: (_, r) =>
        r.subchecks?.length ? (
          <SubcheckPanel
            itemKey={r.key}
            subchecks={r.subchecks}
            subPassedByKey={subPassedByKey}
            onSetSubPassed={onSetSubPassed}
          />
        ) : (
          <Radio.Group
            value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
            onChange={(e) => onSetPassed(r.key, e.target.value === 'pass')}
          >
            <Radio value="pass">Đạt</Radio>
            <Radio value="fail">Không</Radio>
          </Radio.Group>
        ),
    },
    {
      title: 'Ghi chú',
      key: 'note',
      width: '30%',
      render: (_, r) => {
        const st = resolveItemStatus(r)
        const isFail = st === false
        return (
          <Input.TextArea
            id={`check-note-${r.key}`}
            autoSize={{ minRows: 1, maxRows: 3 }}
            value={noteByKey[r.key] ?? ''}
            status={isFail && (!(noteByKey[r.key] ?? '').trim() || invalidItemKey === r.key) ? 'error' : undefined}
            placeholder={isFail ? 'Bắt buộc ghi chú khi Không đạt' : 'Ghi chú (nếu cần)'}
            onChange={(e) => onSetNote(r.key, e.target.value)}
          />
        )
      },
    },
  ]

  return (
    <Card
      id={sectionId}
      title={
        <Space>
          <span>{icon}</span>
          <span>{sectionLabel}</span>
          <Tag color="blue">
            Đạt {stats.pass} / Lỗi {stats.fail} / Còn {stats.todo}
          </Tag>
        </Space>
      }
      size="small"
      styles={{ body: { background: '#fcfcfc' } }}
      extra={
        <Button size="small" onClick={onMarkAllPass}>
          Đạt tất cả
        </Button>
      }
    >
      {isDesktop ? (
        <Table<RowData>
          rowKey={(r) => r.key}
          pagination={false}
          size="middle"
          columns={tableColumns}
          dataSource={data}
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
          activeKey={['items']}
          items={[
            {
              key: 'items',
              collapsible: 'disabled',
              label: `${sectionLabel} • Đạt ${stats.pass} • Lỗi ${stats.fail} • Chưa ${stats.todo}`,
              children: (
                <Space direction="vertical" style={{ width: '100%' }} size="small">
                  {data.map((r) => {
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
                          borderColor:
                            invalidItemKey === r.key || isMissing ? '#ff4d4f' : isFail ? '#ff4d4f' : '#f0f0f0',
                          background:
                            invalidItemKey === r.key || isFail ? '#fff2f0' : st === true ? '#f0fdf4' : '#fff',
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
                            <div
                              style={{
                                background: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                borderRadius: 8,
                                padding: '10px 12px',
                              }}
                            >
                              <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                                Kiểm tra từng ổ / mục:
                              </Typography.Text>
                              {r.subchecks.map((sc) => (
                                <div key={sc.key} style={{ marginBottom: 8 }}>
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
                                      onSetSubPassed(r.key, sc.key, e.target.value === 'pass')
                                      onScrollToNext(r.key)
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
                            </div>
                          ) : (
                            <Radio.Group
                              optionType="button"
                              buttonStyle="solid"
                              className="mobile-toggle-group"
                              style={{ display: 'flex', width: '100%' }}
                              value={passedByKey[r.key] === undefined ? undefined : passedByKey[r.key] ? 'pass' : 'fail'}
                              onChange={(e) => onApplyItemDecision(r.key, e.target.value === 'pass')}
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
                              onChange={(e) => onSetNote(r.key, e.target.value)}
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
}
