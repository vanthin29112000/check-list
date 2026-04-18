import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConfigProvider, theme } from 'antd'
import viVN from 'antd/locale/vi_VN'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ensureFirebaseAnonymousUser } from './lib/firebase'
import 'antd/dist/reset.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

function renderApp() {
  root.render(
    <React.StrictMode>
      <ConfigProvider
        locale={viVN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: { colorSuccess: '#52c41a', colorWarning: '#faad14', colorError: '#ff4d4f' },
        }}
      >
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ConfigProvider>
    </React.StrictMode>,
  )
}

void ensureFirebaseAnonymousUser()
  .then(() => renderApp())
  .catch((e) => {
    root.render(
      <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Không khởi tạo được Firebase</h1>
        <p>{String(e)}</p>
        <p>Kiểm tra file <code>.env</code> (VITE_FIREBASE_*) và bật Anonymous Authentication trên Firebase Console.</p>
      </div>,
    )
  })
