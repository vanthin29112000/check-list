import { useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd'
import { CheckCircleOutlined, SafetyCertificateOutlined, WindowsOutlined } from '@ant-design/icons'
import { authErrorMessage, useAuth } from '../auth/AuthContext'

const FEATURES = [
  'Kiểm tra hệ thống theo ca hàng ngày',
  'Gửi kết quả và thông báo email tự động',
  'Lãnh đạo duyệt checklist qua liên kết bảo mật',
]

export default function LoginPage() {
  const { signInMicrosoft, authRedirectError, user, loading, isManager } = useAuth()
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

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 64px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        background: 'linear-gradient(135deg, #f0f4ff 0%, #f8fafc 50%, #eef2ff 100%)',
      }}
    >
      <Row gutter={[48, 32]} align="middle" style={{ maxWidth: 960, width: '100%' }}>
        <Col xs={24} md={12}>
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
              <Typography.Title level={2} style={{ marginBottom: 8, color: '#0f172a' }}>
                Checklist vận hành
              </Typography.Title>
              <Typography.Paragraph style={{ fontSize: 16, color: '#475569', marginBottom: 0 }}>
                Hệ thống kiểm tra và báo cáo vận hành hàng ngày cho khu vực và phòng máy chủ.
              </Typography.Paragraph>
            </div>
            <Space direction="vertical" size="middle">
              {FEATURES.map((text) => (
                <Space key={text} align="start">
                  <CheckCircleOutlined style={{ color: '#16a34a', marginTop: 4 }} />
                  <Typography.Text style={{ color: '#334155' }}>{text}</Typography.Text>
                </Space>
              ))}
            </Space>
          </Space>
        </Col>

        <Col xs={24} md={12}>
          <Card
            style={{
              borderRadius: 12,
              boxShadow: '0 8px 32px rgba(15, 23, 42, 0.08)',
              border: '1px solid #e2e8f0',
            }}
            styles={{ body: { padding: '32px 28px' } }}
          >
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div style={{ textAlign: 'center' }}>
                <SafetyCertificateOutlined style={{ fontSize: 40, color: '#2563eb', marginBottom: 12 }} />
                <Typography.Title level={4} style={{ marginBottom: 4 }}>
                  Đăng nhập hệ thống
                </Typography.Title>
                <Typography.Text type="secondary">
                  Sử dụng tài khoản Microsoft của tổ chức
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
                style={{ height: 48, fontSize: 15 }}
              >
                Đăng nhập Microsoft
              </Button>

              <Typography.Paragraph
                type="secondary"
                style={{ marginBottom: 0, fontSize: 13, textAlign: 'center' }}
              >
                Đăng nhập một lần — hệ thống ghi nhớ trên thiết bị này. Bạn không cần đăng nhập lại mỗi lần mở.
              </Typography.Paragraph>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  )
}
