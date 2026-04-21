import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  MenuOutlined,
  FileSearchOutlined,
  MailOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { Badge, Button, Drawer, Grid, Layout, Menu, Segmented, Space, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { fetchCompletionStatus, fetchDashboard } from './api/client'
import ApprovePage from './pages/ApprovePage'
import ChecklistFormPage from './pages/ChecklistFormPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import ChecklistSchedulePage from './pages/ChecklistSchedulePage'
import EmailConfigPage from './pages/EmailConfigPage'

type UserRole = 'staff' | 'manager'
const { Sider, Header, Content } = Layout

export default function App() {
  const { lg } = Grid.useBreakpoint()
  const isMobile = !lg
  const loc = useLocation()
  const navigate = useNavigate()
  const redirectedRef = useRef(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [role, setRole] = useState<UserRole>(() => (localStorage.getItem('app-role') as UserRole) || 'staff')
  const [status, setStatus] = useState({ missingToday: 0, pendingApprovals: 0 })

  const key = loc.pathname.startsWith('/approve')
    ? 'approve'
    : loc.pathname.startsWith('/email-config')
      ? 'email-config'
      : loc.pathname.startsWith('/history')
        ? 'history'
        : loc.pathname.startsWith('/schedule')
          ? 'schedule'
          : loc.pathname.startsWith('/dashboard')
            ? 'dashboard'
            : 'checklist'

  useEffect(() => {
    localStorage.setItem('app-role', role)
  }, [role])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [completion, dashboard] = await Promise.all([
          fetchCompletionStatus({ date: dayjs().format('YYYY-MM-DD') }),
          fetchDashboard({}),
        ])
        if (cancelled) return
        const missingToday = completion.items.filter((x) => !x.isCompletedToday).length
        setStatus({
          missingToday,
          pendingApprovals: dashboard.overview.pendingApprovalCount,
        })
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loc.pathname])

  useEffect(() => {
    if (role !== 'staff') return
    if (status.missingToday <= 0) return
    if (loc.pathname === '/' || loc.pathname === '/dashboard') return
    if (redirectedRef.current) return
    redirectedRef.current = true
    void navigate('/', { replace: true })
  }, [role, status.missingToday, loc.pathname, navigate])

  useEffect(() => {
    if (role !== 'staff') return
    if (!loc.pathname.startsWith('/email-config')) return
    void navigate('/', { replace: true })
  }, [role, loc.pathname, navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [loc.pathname])

  const menuItems = useMemo<MenuProps['items']>(() => {
    const actionLabel = (
      <Tooltip title="Bắt đầu checklist ngay để tránh sót việc trong ca">
        <Space>
          <CheckCircleOutlined />
          <Typography.Text strong style={{ color: 'inherit' }}>
            Thực hiện checklist
          </Typography.Text>
          {status.missingToday > 0 ? <Badge count={status.missingToday} /> : null}
        </Space>
      </Tooltip>
    )

    if (role === 'staff') {
      return [
        {
          type: 'group',
          key: 'operations-group',
          label: 'VẬN HÀNH',
          children: [{ key: 'checklist', icon: <AppstoreOutlined />, label: <Link to="/">{actionLabel}</Link> }],
        },
        {
          type: 'group',
          key: 'monitor-group',
          label: 'THEO DÕI',
          children: [
            {
              key: 'schedule',
              icon: <CalendarOutlined />,
              label: (
                <Tooltip title="Theo dõi trạng thái theo lịch tháng/tuần/năm">
                  <Link to="/schedule">Lịch checklist</Link>
                </Tooltip>
              ),
            },
            {
              key: 'dashboard',
              icon: <BarChartOutlined />,
              label: (
                <Tooltip title="Xem số liệu lỗi và duyệt checklist">
                  <Link to="/dashboard">Dashboard</Link>
                </Tooltip>
              ),
            },
          ],
        },
        {
          type: 'group',
          key: 'manage-group',
          label: 'QUẢN LÝ',
          children: [
            {
              key: 'history',
              icon: <ClockCircleOutlined />,
              label: (
                <Tooltip title="Tra cứu bản checklist đã nộp">
                  <Link to="/history">Lịch sử checklist</Link>
                </Tooltip>
              ),
            },
          ],
        },
      ]
    }

    return [
      {
        type: 'group',
        key: 'operations-group',
        label: 'VẬN HÀNH',
        children: [{ key: 'checklist', icon: <AppstoreOutlined />, label: <Link to="/">{actionLabel}</Link> }],
      },
      {
        type: 'group',
        key: 'monitor-group',
        label: 'THEO DÕI',
        children: [
          { key: 'schedule', icon: <CalendarOutlined />, label: <Link to="/schedule">Lịch checklist</Link> },
          { key: 'dashboard', icon: <BarChartOutlined />, label: <Link to="/dashboard">Dashboard</Link> },
        ],
      },
      {
        type: 'group',
        key: 'manager-group',
        label: 'QUẢN LÝ',
        children: [
          {
            key: 'history',
            icon: <FileSearchOutlined />,
            label: (
              <Space>
                <Link to="/history">Duyệt / Lịch sử checklist</Link>
                {status.pendingApprovals > 0 ? <Badge count={status.pendingApprovals} /> : null}
              </Space>
            ),
          },
          {
            key: 'email-config',
            icon: <MailOutlined />,
            label: <Link to="/email-config">Cấu hình email</Link>,
          },
        ],
      },
    ]
  }, [role, status.missingToday, status.pendingApprovals])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider
          breakpoint="lg"
          collapsedWidth={0}
          width={280}
          style={{ background: '#0f172a' }}
        >
          <div style={{ padding: 16, color: '#fff' }}>
            <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
              Checklist vận hành
            </Typography.Title>
            <Typography.Text style={{ color: '#cbd5e1' }}>
              Ký túc xá - Theo ca
            </Typography.Text>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={key === 'approve' ? [] : [key]}
            items={menuItems}
          />
        </Sider>
      )}
      <Layout>
        <Header style={{ background: '#fff', borderBottom: '1px solid #f0f0f0', paddingInline: isMobile ? 12 : 16, height: 'auto', lineHeight: 1, paddingBlock: 10 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space size={8}>
                {isMobile && (
                  <Button
                    icon={<MenuOutlined />}
                    onClick={() => setMobileNavOpen(true)}
                    aria-label="Mở menu điều hướng"
                  />
                )}
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => navigate('/')}>
                  {isMobile ? 'Checklist' : 'Thực hiện checklist'}
                </Button>
              </Space>
              <Space size={6}>
                <UserSwitchOutlined />
                <Segmented<UserRole>
                  size={isMobile ? 'small' : 'middle'}
                  value={role}
                  options={[
                    { label: 'Staff', value: 'staff' },
                    { label: 'Manager', value: 'manager' },
                  ]}
                  onChange={(v) => setRole(v)}
                />
              </Space>
            </Space>
            {status.missingToday > 0 ? (
              <Badge color="red" text={`Chưa checklist hôm nay: ${status.missingToday}`} />
            ) : (
              <Badge color="green" text="Đã hoàn thành checklist hôm nay" />
            )}
          </Space>
        </Header>
        <Content style={{ padding: isMobile ? 12 : 24 }}>
          <Routes>
            <Route path="/approve" element={<ApprovePage />} />
            <Route path="/" element={<ChecklistFormPage />} />
            <Route path="/schedule" element={<ChecklistSchedulePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/history" element={<HistoryPage />} />
            <Route path="/email-config" element={<EmailConfigPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Content>
      </Layout>
      {isMobile && (
        <Drawer
          title="Checklist vận hành"
          placement="left"
          width={300}
          onClose={() => setMobileNavOpen(false)}
          open={mobileNavOpen}
          styles={{ body: { padding: 0, background: '#0f172a' }, header: { padding: '12px 16px' } }}
        >
          <div style={{ padding: 12, color: '#fff' }}>
            <Typography.Text style={{ color: '#cbd5e1' }}>Ký túc xá - Theo ca</Typography.Text>
          </div>
          <Menu
            theme="dark"
            mode="inline"
            selectedKeys={key === 'approve' ? [] : [key]}
            items={menuItems}
          />
        </Drawer>
      )}
    </Layout>
  )
}
