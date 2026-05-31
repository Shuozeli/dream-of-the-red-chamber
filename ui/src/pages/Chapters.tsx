import { useEffect, useState } from 'react'
import {
  Card,
  Drawer,
  Empty,
  Space,
  Spin,
  Splitter,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type ChapterDetail, type ChapterListItem } from '../api'
import { useIsMobile } from '../lib/useIsMobile'

export default function Chapters() {
  const navigate = useNavigate()
  const { n: nParam } = useParams<{ n?: string }>()
  const selectedId = nParam ? Number(nParam) : null
  const isMobile = useIsMobile()

  const [items, setItems] = useState<ChapterListItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api
      .chapters()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const columns: TableProps<ChapterListItem>['columns'] = [
    { title: '回', dataIndex: 'id', key: 'id', width: 60, sorter: (a, b) => a.id - b.id },
    { title: '回目', dataIndex: 'title', key: 'title', render: (t: string) => <strong>{t}</strong> },
    { title: '字数', dataIndex: 'word_count', key: 'word_count', width: 70, sorter: (a, b) => a.word_count - b.word_count, responsive: ['md'] },
    { title: '事件', dataIndex: 'event_count', key: 'event_count', width: 60, sorter: (a, b) => a.event_count - b.event_count },
    { title: '诗词', dataIndex: 'poem_count', key: 'poem_count', width: 60, sorter: (a, b) => a.poem_count - b.poem_count, responsive: ['md'] },
  ]

  const tableCard = (
    <Card
      size="small"
      title={
        <Space>
          <span>章回</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            共 {items.length} 回
          </Typography.Text>
        </Space>
      }
      styles={{ body: { padding: 0, height: 'calc(100% - 38px)' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none' }}
    >
      <Table<ChapterListItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        rowClassName={(record) => (record.id === selectedId && !isMobile ? 'row-selected' : '')}
        onRow={(record) => ({
          onClick: () => navigate(`/chapters/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={false}
        scroll={{ y: 'calc(100vh - 138px)' }}
      />
    </Card>
  )

  if (isMobile) {
    return (
      <>
        {tableCard}
        <Drawer
          open={selectedId !== null}
          placement="right"
          width="100%"
          onClose={() => navigate('/chapters')}
          title="章回详情"
          styles={{ body: { padding: 0 } }}
        >
          {selectedId !== null && <ChapterDetailPane id={selectedId} />}
        </Drawer>
      </>
    )
  }

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="45%" min="25%">{tableCard}</Splitter.Panel>
      <Splitter.Panel min="30%">
        {selectedId === null ? <EmptyDetail /> : <ChapterDetailPane id={selectedId} />}
      </Splitter.Panel>
    </Splitter>
  )
}

function EmptyDetail() {
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fafaf7',
      }}
    >
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            从左侧表中选择一回
          </Typography.Text>
        }
      />
    </div>
  )
}

function ChapterDetailPane({ id }: { id: number }) {
  const navigate = useNavigate()
  const [data, setData] = useState<ChapterDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setData(null)
    api.chapter(id).then(setData).finally(() => setLoading(false))
  }, [id])

  return (
    <Card
      size="small"
      title={data ? `第 ${data.id} 回 · ${data.title}` : '加载中…'}
      styles={{ body: { padding: '0 14px', height: 'calc(100% - 38px)' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none', borderLeft: '1px solid #f0f0f0' }}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      )}
      {data && (
        <Tabs
          defaultActiveKey="text"
          items={[
            {
              key: 'text',
              label: '原文',
              children: (
                <div className="narrative" style={{ height: 'calc(100vh - 188px)', overflowY: 'auto' }}>
                  {data.text}
                </div>
              ),
            },
            {
              key: 'events',
              label: `事件 (${data.events.length})`,
              children: (
                <div style={{ height: 'calc(100vh - 188px)', overflowY: 'auto' }}>
                  {data.events.map((e) => (
                    <div
                      key={e.id}
                      style={{ marginBottom: 10, padding: 10, border: '1px solid #f0f0f0', borderRadius: 4 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color="geekblue">{e.kind}</Tag>
                        <Typography.Link onClick={() => navigate(`/events/${e.id}`)}>
                          <strong>{e.title}</strong>
                        </Typography.Link>
                        {e.location_hint && (
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            @ {e.location_hint}
                          </Typography.Text>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>{e.summary}</div>
                      {e.participant_names && e.participant_names.length > 0 && (
                        <div style={{ marginTop: 4 }}>
                          {e.participant_ids.map((pid, i) => (
                            <Tag
                              key={pid}
                              style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}
                              onClick={() => navigate(`/characters/${pid}`)}
                            >
                              {e.participant_names[i]}
                            </Tag>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ),
            },
            {
              key: 'poems',
              label: `诗词 (${data.poems.length})`,
              children: (
                <div style={{ height: 'calc(100vh - 188px)', overflowY: 'auto' }}>
                  {data.poems.map((p) => (
                    <div
                      key={p.id}
                      style={{ marginBottom: 10, padding: 10, border: '1px solid #f0f0f0', borderRadius: 4 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                        <Tag color="magenta">{p.form}</Tag>
                        <Typography.Link onClick={() => navigate(`/poems/${p.id}`)}>
                          <strong>{p.title || p.first_line.slice(0, 18)}</strong>
                        </Typography.Link>
                        {p.author_name && p.author_id && (
                          <Tag
                            color="orange"
                            style={{ cursor: 'pointer' }}
                            onClick={() => navigate(`/characters/${p.author_id}`)}
                          >
                            {p.author_name}
                          </Tag>
                        )}
                      </div>
                      {p.occasion && (
                        <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>{p.occasion}</div>
                      )}
                      <div style={{ fontSize: 12, marginTop: 4 }}>{p.first_line}</div>
                    </div>
                  ))}
                </div>
              ),
            },
          ]}
        />
      )}
    </Card>
  )
}
