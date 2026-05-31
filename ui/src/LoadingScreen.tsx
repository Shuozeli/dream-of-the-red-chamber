import { useEffect, useState } from 'react'
import { Progress, Typography } from 'antd'
import { NodeIndexOutlined } from '@ant-design/icons'
import { type DbStatus, subscribeDbStatus, getDB } from './db'

function fmt(bytes?: number): string {
  if (bytes == null) return '?'
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${bytes} B`
}

const PHASE_LABELS: Record<DbStatus['phase'], string> = {
  idle: '准备启动…',
  wasm: '加载 DuckDB-WASM 引擎…',
  fetch: '下载知识库 (hongloumeng.duckdb)…',
  open: '打开数据库…',
  ready: '就绪',
  error: '加载失败',
}

interface Props {
  /** Children only render when status is 'ready'. */
  children: React.ReactNode
}

export default function LoadingGate({ children }: Props) {
  const [status, setStatus] = useState<DbStatus>({ phase: 'idle' })

  useEffect(() => {
    const unsub = subscribeDbStatus(setStatus)
    // Kick off init on mount.
    getDB().catch(() => {})
    return unsub
  }, [])

  if (status.phase === 'ready') {
    return <>{children}</>
  }

  // Approximate overall progress across the three phases.
  // wasm = 0-25%, fetch = 25-90%, open = 90-100%.
  let pct = 0
  if (status.phase === 'wasm') pct = 10
  else if (status.phase === 'fetch') {
    if (status.total && status.received) {
      pct = 25 + Math.round((status.received / status.total) * 65)
    } else {
      pct = 30
    }
  } else if (status.phase === 'open') pct = 95
  else if (status.phase === 'error') pct = 100

  const isError = status.phase === 'error'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#3d2817',
        flexDirection: 'column',
        gap: 20,
        padding: 24,
        color: '#f6d3a3',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <NodeIndexOutlined style={{ fontSize: 28 }} />
        <Typography.Title level={2} style={{ margin: 0, color: '#f6d3a3' }}>
          Dream of the Red Chamber
        </Typography.Title>
      </div>

      <div style={{ width: 'min(420px, 80vw)' }}>
        <Progress
          percent={pct}
          showInfo={false}
          status={isError ? 'exception' : 'active'}
          strokeColor={isError ? '#cf1322' : '#f6d3a3'}
          trailColor="rgba(246, 211, 163, 0.2)"
        />
        <div style={{ marginTop: 10, fontSize: 13, textAlign: 'center' }}>
          {PHASE_LABELS[status.phase]}
          {status.phase === 'fetch' && status.received != null && (
            <span style={{ marginLeft: 8, opacity: 0.85 }}>
              {fmt(status.received)}
              {status.total ? ` / ${fmt(status.total)}` : ''}
            </span>
          )}
        </div>
        {isError && status.error && (
          <Typography.Paragraph
            style={{
              marginTop: 12,
              color: '#ffccc7',
              fontSize: 12,
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
            }}
          >
            {status.error}
          </Typography.Paragraph>
        )}
      </div>

      <Typography.Text style={{ color: 'rgba(246, 211, 163, 0.6)', fontSize: 11 }}>
        首次加载约 13 MB,后续会被浏览器缓存
      </Typography.Text>
    </div>
  )
}
