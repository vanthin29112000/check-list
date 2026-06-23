import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Alert, Button, Card, Space, Typography } from 'antd'
import { UserOutlined, WindowsOutlined } from '@ant-design/icons'
import { authErrorMessage, useAuth } from '../auth/AuthContext'

export default function LoginPage() {
  const { signInMicrosoft, signInAnonymousDev, allowAnonymousLogin, authRedirectError, user, loading, isManager } = useAuth()
  const loc = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(authRedirectError)

  const from = (loc.state as { from?: string } | null)?.from

  if (!loading && user) {
    if (from) return <Navigate to={from} replace />
    return <Navigate to={isManager ? '/dashboard' : '/checklist'} replace />
  }

  async function handleMicrosoftLogin() {
    setError(null)
    setSubmitting(true)
    try {
      await signInMicrosoft()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleAnonymousLogin() {
    setError(null)
    setSubmitting(true)
    try {
      await signInAnonymousDev()
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Card style={{ maxWidth: 480, width: '100%' }}>
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <div>
            <Typography.Title level={3} style={{ marginBottom: 8 }}>
              Checklist vận hành
            </Typography.Title>
            <Typography.Text type="secondary">
              Đăng nhập bằng tài khoản Microsoft của tổ chức để nộp và duyệt checklist.
            </Typography.Text>
          </div>

          {error ? <Alert type="error" message={error} showIcon /> : null}

          <Button
            type="primary"
            size="large"
            block
            loading={submitting}
            icon={<WindowsOutlined />}
            onClick={() => void handleMicrosoftLogin()}
          >
            Đăng nhập Microsoft
          </Button>

          {allowAnonymousLogin ? (
            <>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Chế độ dev: bật `VITE_ALLOW_ANONYMOUS_LOGIN=1` — cần bật Anonymous trên Firebase Console.
              </Typography.Text>
              <Button
                size="large"
                block
                loading={submitting}
                icon={<UserOutlined />}
                onClick={() => void handleAnonymousLogin()}
              >
                Tiếp tục ẩn danh (dev)
              </Button>
            </>
          ) : (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
              
            </Typography.Paragraph>
          )}
        </Space>
      </Card>
    </div>
  )
}
