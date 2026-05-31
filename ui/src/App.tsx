import { useState } from 'react'
import { Button, Drawer, Layout, Menu, Typography } from 'antd'
import {
  DashboardOutlined,
  NodeIndexOutlined,
  TeamOutlined,
  CalendarOutlined,
  ReadOutlined,
  BookOutlined,
  MenuOutlined,
} from '@ant-design/icons'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import Overview from './pages/Overview'
import Characters from './pages/Characters'
import Events from './pages/Events'
import Poems from './pages/Poems'
import Chapters from './pages/Chapters'
import GraphView from './pages/GraphView'
import LoadingGate from './LoadingScreen'
import { useIsMobile } from './lib/useIsMobile'

const { Header, Content } = Layout

const MENU_ITEMS = [
  { key: 'overview', label: '总览', icon: <DashboardOutlined /> },
  { key: 'characters', label: '人物', icon: <TeamOutlined /> },
  { key: 'events', label: '事件', icon: <CalendarOutlined /> },
  { key: 'poems', label: '诗词', icon: <ReadOutlined /> },
  { key: 'chapters', label: '章回', icon: <BookOutlined /> },
  { key: 'graph', label: '关系图', icon: <NodeIndexOutlined /> },
]

export default function App() {
  const navigate = useNavigate()
  const loc = useLocation()
  const isMobile = useIsMobile()
  const [menuOpen, setMenuOpen] = useState(false)

  // Derive the active menu key from the URL (first path segment).
  const currentKey = loc.pathname.split('/').filter(Boolean)[0] || 'overview'

  const onMenuClick = (key: string) => {
    navigate(`/${key}`)
    setMenuOpen(false)
  }

  return (
    <LoadingGate>
      <Layout style={{ height: '100vh' }}>
        <Header
          style={{
            height: 52,
            lineHeight: '52px',
            background: '#3d2817',
            padding: '0 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexShrink: 0,
          }}
        >
          {isMobile && (
            <Button
              type="text"
              icon={<MenuOutlined />}
              onClick={() => setMenuOpen(true)}
              style={{ color: '#f6d3a3', fontSize: 18 }}
            />
          )}
          <Typography.Text
            strong
            style={{
              color: '#f6d3a3',
              fontSize: isMobile ? 14 : 17,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              flex: isMobile ? 1 : undefined,
            }}
          >
            {!isMobile && <NodeIndexOutlined style={{ marginRight: 8 }} />}
            Dream of the Red Chamber
          </Typography.Text>
          {!isMobile && (
            <Menu
              mode="horizontal"
              theme="dark"
              selectedKeys={[currentKey]}
              onClick={(e) => onMenuClick(e.key)}
              items={MENU_ITEMS}
              style={{
                flex: 1,
                background: 'transparent',
                borderBottom: 'none',
                minWidth: 0,
              }}
            />
          )}
        </Header>

        {/* Mobile-only side drawer with the same menu items, vertical. */}
        <Drawer
          open={menuOpen}
          placement="left"
          onClose={() => setMenuOpen(false)}
          width={240}
          styles={{
            header: { background: '#3d2817', borderBottom: '1px solid #2a1c10' },
            body: { padding: 0, background: '#3d2817' },
          }}
          title={
            <span style={{ color: '#f6d3a3' }}>
              <NodeIndexOutlined style={{ marginRight: 8 }} />
              Dream of the Red Chamber
            </span>
          }
        >
          <Menu
            mode="vertical"
            theme="dark"
            selectedKeys={[currentKey]}
            onClick={(e) => onMenuClick(e.key)}
            items={MENU_ITEMS}
            style={{ background: 'transparent', borderRight: 'none' }}
          />
        </Drawer>

        <Content style={{ overflow: 'hidden', background: '#f5f5f0' }}>
          <Routes>
            <Route path="/" element={<Navigate to="/overview" replace />} />
            <Route path="/overview" element={<Overview onNavigate={(v) => navigate(`/${v}`)} />} />
            <Route path="/characters" element={<Characters />} />
            <Route path="/characters/:id" element={<Characters />} />
            <Route path="/events" element={<Events />} />
            <Route path="/events/:id" element={<Events />} />
            <Route path="/poems" element={<Poems />} />
            <Route path="/poems/:id" element={<Poems />} />
            <Route path="/chapters" element={<Chapters />} />
            <Route path="/chapters/:n" element={<Chapters />} />
            <Route path="/graph" element={<GraphView />} />
            <Route path="/graph/:id" element={<GraphView />} />
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </Content>
      </Layout>
    </LoadingGate>
  )
}
