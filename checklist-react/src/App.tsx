import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  AppstoreOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  LogoutOutlined,
  MenuOutlined,
  MailOutlined,
} from '@ant-design/icons'
import { Badge, Button, Drawer, Grid, Layout, Menu, Space, Tooltip, Typography } from 'antd'
import type { MenuProps } from 'antd'
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
import { useAuth } from './auth/AuthContext'
import { RequireAuth, RequireRole } from './auth/RequireAuth'
import { fetchCompletionStatus, fetchDashboard } from './api/client'
import ApprovePage from './pages/ApprovePage'
import ChecklistFormPage from './pages/ChecklistFormPage'
import DashboardPage from './pages/DashboardPage'
import HistoryPage from './pages/HistoryPage'
import ChecklistSchedulePage from './pages/ChecklistSchedulePage'
import EmailConfigPage from './pages/EmailConfigPage'
import LoginPage from './pages/LoginPage'
import SubmissionDetailPage from './pages/SubmissionDetailPage'

const { Sider, Header, Content } = Layout
const SIDER_WIDTH = 280

function PublicShell({ children }: { children: ReactNode }) {
  return (
    <Layout
      style={{
        height: '100vh',
        overflow: 'hidden',
        background: '#f8fafc',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Header
        style={{
          flexShrink: 0,
          background: '#0f172a',
          paddingInline: 16,
          lineHeight: '64px',
        }}
      >
        <Typography.Title level={5} style={{ color: '#fff', margin: 0 }}>
          Checklist vận hành
        </Typography.Title>
      </Header>
      <Content style={{ flex: 1, overflow: 'auto' }}>{children}</Content>
    </Layout>
  )
}

function AppShell({ children }: { children: ReactNode }) {
  const { lg } = Grid.useBreakpoint()
  const isMobile = !lg
  const loc = useLocation()
  const navigate = useNavigate()
  const redirectedRef = useRef(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const { profile, role, isManager, logout } = useAuth()
  const [status, setStatus] = useState({ missingToday: 0, pendingApprovals: 0 })

  const key = loc.pathname.startsWith('/submission')
    ? 'submission'
    : loc.pathname.startsWith('/email-config')
      ? 'email-config'
      : loc.pathname.startsWith('/history')
        ? 'history'
        : loc.pathname.startsWith('/schedule')
          ? 'schedule'
          : loc.pathname.startsWith('/dashboard')
            ? 'dashboard'
            : loc.pathname.startsWith('/checklist')
              ? 'checklist'
              : 'dashboard'

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [completion, dashboard] = await Promise.all([
          fetchCompletionStatus({ date: dayjs().format('YYYY-MM-DD') }),
          fetchDashboard({}),
        ])
        if (cancelled) return
        setStatus({
          missingToday: completion.items.filter((x) => !x.isCompletedToday).length,
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
    if (isManager) return
    if (status.missingToday <= 0) return
    if (loc.pathname === '/checklist' || loc.pathname === '/schedule') return
    if (redirectedRef.current) return
    redirectedRef.current = true
    void navigate('/checklist', { replace: true })
  }, [isManager, status.missingToday, loc.pathname, navigate])

  useEffect(() => {
    setMobileNavOpen(false)
  }, [loc.pathname])

  const menuItems = useMemo<MenuProps['items']>(() => {
    const actionLabel = (
      <Tooltip title="Bắt đầu checklist ngay">
        <Space>
          <CheckCircleOutlined />
          <Typography.Text strong style={{ color: 'inherit' }}>
            Thực hiện checklist
          </Typography.Text>
          {status.missingToday > 0 ? <Badge count={status.missingToday} /> : null}
        </Space>
      </Tooltip>
    )

    const monitor = [
      {
        key: 'schedule',
        icon: <CalendarOutlined />,
        label: <Link to="/schedule">Lịch checklist</Link>,
      },
      {
        key: 'dashboard',
        icon: <BarChartOutlined />,
        label: <Link to="/dashboard">Dashboard</Link>,
      },
    ]

    const manage: MenuProps['items'] = [
      {
        key: 'history',
        icon: <ClockCircleOutlined />,
        label: (
          <Space>
            <Link to="/history">Lịch sử checklist</Link>
            {isManager && status.pendingApprovals > 0 ? <Badge count={status.pendingApprovals} /> : null}
          </Space>
        ),
      },
    ]

    if (isManager) {
      manage.push({
        key: 'email-config',
        icon: <MailOutlined />,
        label: <Link to="/email-config">Cấu hình email</Link>,
      })
    }

    return [
      {
        type: 'group',
        key: 'work-group',
        label: 'CÔNG VIỆC',
        children: [{ key: 'checklist', icon: <AppstoreOutlined />, label: <Link to="/checklist">{actionLabel}</Link> }],
      },
      {
        type: 'group',
        key: 'monitor-group',
        label: 'THEO DÕI',
        children: monitor,
      },
      {
        type: 'group',
        key: 'manage-group',
        label: 'QUẢN LÝ',
        children: manage,
      },
    ]
  }, [status.missingToday, status.pendingApprovals, isManager])

  return (
    <Layout style={{ height: '100vh', overflow: 'hidden' }}>
      {!isMobile && (
        <Sider
          width={SIDER_WIDTH}
          style={{
            position: 'fixed',
            left: 0,
            top: 0,
            bottom: 0,
            height: '100vh',
            overflowY: 'auto',
            zIndex: 1001,
            background: '#0f172a',
          }}
        >
          <div style={{ padding: 16, color: '#fff' }}>
            <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>
              Checklist vận hành
            </Typography.Title>
            <Typography.Text style={{ color: '#cbd5e1' }}>Ký túc xá — Theo ca</Typography.Text>
          </div>
          <Menu theme="dark" mode="inline" selectedKeys={[key]} items={menuItems} />
        </Sider>
      )}
      <Layout
        style={{
          marginLeft: isMobile ? 0 : SIDER_WIDTH,
          height: '100vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Header
          style={{
            flexShrink: 0,
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            paddingInline: isMobile ? 12 : 16,
            height: 'auto',
            lineHeight: 1,
            paddingBlock: 10,
            zIndex: 1000,
          }}
        >
          <Space direction="vertical" style={{ width: '100%' }} size={8}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space size={8}>
                {isMobile && (
                  <Button icon={<MenuOutlined />} onClick={() => setMobileNavOpen(true)} aria-label="Mở menu" />
                )}
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => navigate('/checklist')}>
                  {isMobile ? 'Checklist' : 'Thực hiện checklist'}
                </Button>
              </Space>
              <Space size={8}>
                <Typography.Text type="secondary" ellipsis style={{ maxWidth: 180 }}>
                  {profile?.displayName ?? profile?.email ?? ''}
                </Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  ({role === 'leader' ? 'Lãnh đạo' : role === 'manager' ? 'Quản lý' : 'Nhân viên'})
                </Typography.Text>
                <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()}>
                  {isMobile ? '' : 'Đăng xuất'}
                </Button>
              </Space>
            </Space>
            {status.missingToday > 0 ? (
              <Badge color="red" text={`Chưa checklist hôm nay: ${status.missingToday}`} />
            ) : (
              <Badge color="green" text="Đã hoàn thành checklist hôm nay" />
            )}
          </Space>
        </Header>
        <Content style={{ flex: 1, overflow: 'auto', padding: isMobile ? 12 : 24 }}>{children}</Content>
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
          <Menu theme="dark" mode="inline" selectedKeys={[key]} items={menuItems} />
        </Drawer>
      )}
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicShell>
            <LoginPage />
          </PublicShell>
        }
      />
      <Route
        path="/approve"
        element={
          <PublicShell>
            <RequireAuth>
              <RequireRole roles={['manager', 'leader']}>
                <ApprovePage />
              </RequireRole>
            </RequireAuth>
          </PublicShell>
        }
      />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell>
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/checklist" element={<ChecklistFormPage />} />
                <Route path="/schedule" element={<ChecklistSchedulePage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/submission/:resultId" element={<SubmissionDetailPage />} />
                <Route
                  path="/email-config"
                  element={
                    <RequireRole roles={['manager', 'leader']}>
                      <EmailConfigPage />
                    </RequireRole>
                  }
                />
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </AppShell>
          </RequireAuth>
        }
      />
    </Routes>
  )
}
