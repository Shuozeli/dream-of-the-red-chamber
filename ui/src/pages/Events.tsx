import { useEffect, useState } from 'react'
import {
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Spin,
  Splitter,
  Table,
  Tag,
  Typography,
} from 'antd'
import type { TableProps } from 'antd'
import { useNavigate, useParams } from 'react-router-dom'
import { api, type EventDetail, type EventListItem } from '../api'
import { useIsMobile } from '../lib/useIsMobile'
import { useCursor } from '../lib/useCursor'
import { CursorPagination } from '../lib/CursorPagination'

const PAGE_SIZE = 50

const EVENT_KINDS = [
  '其他', '议事', '相遇', '探病', '争吵', '闯祸', '离别', '家宴', '诗会', '葬礼',
  '梦', '偷听', '对联', '行酒令', '灯谜', '婚礼',
]

export default function Events() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id?: string }>()
  const selectedId = idParam ? Number(idParam) : null
  const isMobile = useIsMobile()

  const [q, setQ] = useState('')
  const [chapterFilter, setChapterFilter] = useState<number | null>(null)
  const [kindFilter, setKindFilter] = useState<string | undefined>()
  const [items, setItems] = useState<EventListItem[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [loading, setLoading] = useState(false)

  // Cursor resets to first page when any filter changes (resetKey).
  const cursor = useCursor(`${q}|${chapterFilter ?? ''}|${kindFilter ?? ''}`)

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      api
        .events({
          q: q || undefined,
          chapter: chapterFilter ?? undefined,
          kind: kindFilter,
          page_size: PAGE_SIZE,
          page_token: cursor.currentToken,
        })
        .then((r) => {
          setItems(r.items)
          setTotalSize(r.total_size)
          cursor.setNextToken(r.next_page_token)
        })
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, chapterFilter, kindFilter, cursor.currentToken])

  const columns: TableProps<EventListItem>['columns'] = [
    { title: '回', dataIndex: 'chapter', key: 'chapter', width: 50 },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 70,
      render: (k: string) => <Tag color="geekblue">{k}</Tag>,
    },
    { title: '标题', dataIndex: 'title', key: 'title', render: (t: string) => <strong>{t}</strong> },
    {
      title: '参与者',
      dataIndex: 'participant_names',
      key: 'participants',
      width: 260,
      responsive: ['md'],
      render: (_n, r: EventListItem) => (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
          {r.participant_names.slice(0, 5).map((name, i) => (
            <Tag
              key={r.participant_ids[i]}
              style={{ fontSize: 11, margin: 0, cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation()
                navigate(`/characters/${r.participant_ids[i]}`)
              }}
            >
              {name}
            </Tag>
          ))}
          {r.participant_names.length > 5 && (
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              +{r.participant_names.length - 5}
            </Typography.Text>
          )}
        </div>
      ),
    },
  ]

  const tableCard = (
    <Card
      size="small"
      title={
        <Space>
          <span>事件</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            共 {totalSize} 件
          </Typography.Text>
        </Space>
      }
      extra={
        <Space size={4} wrap>
          <InputNumber
            size="small"
            placeholder="章"
            min={1}
            max={120}
            value={chapterFilter ?? undefined}
            onChange={(v) => setChapterFilter(typeof v === 'number' ? v : null)}
            style={{ width: 60 }}
          />
          <Select
            size="small"
            placeholder="类型"
            allowClear
            value={kindFilter}
            onChange={setKindFilter}
            options={EVENT_KINDS.map((k) => ({ value: k, label: k }))}
            style={{ width: 90 }}
          />
          <Input.Search
            placeholder="搜索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            allowClear
            style={{ width: isMobile ? 110 : 180 }}
            size="small"
          />
        </Space>
      }
      styles={{ body: { padding: 0, height: 'calc(100% - 38px)' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none' }}
    >
      <Table<EventListItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        rowClassName={(record) => (record.id === selectedId && !isMobile ? 'row-selected' : '')}
        onRow={(record) => ({
          onClick: () => navigate(`/events/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        pagination={false}
        scroll={{ y: 'calc(100vh - 180px)', x: isMobile ? 'max-content' : undefined }}
        footer={() => (
          <CursorPagination
            cursor={cursor}
            pageSize={PAGE_SIZE}
            shownInPage={items.length}
            totalSize={totalSize}
            unit="件"
          />
        )}
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
          onClose={() => navigate('/events')}
          title="事件详情"
          styles={{ body: { padding: 0 } }}
        >
          {selectedId !== null && <EventDetailPane id={selectedId} />}
        </Drawer>
      </>
    )
  }

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="60%" min="35%">{tableCard}</Splitter.Panel>
      <Splitter.Panel min="25%">
        {selectedId === null ? <EmptyDetail /> : <EventDetailPane id={selectedId} />}
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
            从左侧表中选择一件事件
          </Typography.Text>
        }
      />
    </div>
  )
}

function EventDetailPane({ id }: { id: number }) {
  const navigate = useNavigate()
  const [data, setData] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setData(null)
    api.event(id).then(setData).finally(() => setLoading(false))
  }, [id])

  return (
    <Card
      size="small"
      title={data ? `第${data.chapter}回 · ${data.title}` : '加载中…'}
      styles={{ body: { padding: 14, height: 'calc(100% - 38px)', overflowY: 'auto' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none', borderLeft: '1px solid #f0f0f0' }}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      )}
      {data && (
        <>
          <Descriptions size="small" column={1} bordered>
            <Descriptions.Item label="类型">
              <Tag color="geekblue">{data.kind}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="章回 / 场">
              <Typography.Link onClick={() => navigate(`/chapters/${data.chapter}`)}>
                第 {data.chapter} 回
              </Typography.Link>
              {' '}· 第 {data.scene_index} 场
            </Descriptions.Item>
            {data.location_hint && (
              <Descriptions.Item label="地点">{data.location_hint}</Descriptions.Item>
            )}
            <Descriptions.Item label="摘要">{data.summary}</Descriptions.Item>
          </Descriptions>

          {data.evidence_quote && (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                原文引证
              </Typography.Title>
              <blockquote
                style={{
                  borderLeft: '3px solid #b45309',
                  paddingLeft: 12,
                  margin: 0,
                  color: '#595959',
                  fontStyle: 'italic',
                }}
              >
                {data.evidence_quote}
              </blockquote>
            </>
          )}

          {data.participants.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                参与者 ({data.participants.length})
              </Typography.Title>
              <div style={{ lineHeight: '28px' }}>
                {data.participants.map((p) => (
                  <Tag
                    color="orange"
                    key={p.id}
                    style={{ marginBottom: 4, cursor: 'pointer' }}
                    onClick={() => navigate(`/characters/${p.id}`)}
                  >
                    {p.canonical_name}
                  </Tag>
                ))}
              </div>
            </>
          )}

          {data.unresolved_participants.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 16 }}>
                未解析的名称 ({data.unresolved_participants.length})
              </Typography.Title>
              <div style={{ color: '#8c8c8c', lineHeight: '22px' }}>
                {data.unresolved_participants.map((u) => (
                  <Tag key={u} style={{ marginBottom: 3 }}>{u}</Tag>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
