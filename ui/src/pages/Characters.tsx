import { useEffect, useState } from 'react'
import {
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  List,
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
import {
  api,
  type CharacterDetail,
  type CharacterListItem,
  type EventListItem,
  type PoemListItem,
} from '../api'
import { useIsMobile } from '../lib/useIsMobile'
import { useCursor } from '../lib/useCursor'
import { CursorPagination } from '../lib/CursorPagination'

const PAGE_SIZE = 50

function roleColor(r: string) {
  return r === '主角' ? 'red' : r === '配角' ? 'gold' : r === '群众' ? 'default' : 'default'
}

const ROLES = ['主角', '配角', '群众', '提及']

export default function Characters() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id?: string }>()
  const selectedId = idParam ? Number(idParam) : null
  const isMobile = useIsMobile()

  const [q, setQ] = useState('')
  const [items, setItems] = useState<CharacterListItem[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [loading, setLoading] = useState(false)
  const [roleFilter, setRoleFilter] = useState<string[]>([])

  const cursor = useCursor(q)

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      api
        .characters({
          q: q || undefined,
          sort: 'chapters',
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
  }, [q, cursor.currentToken])

  const filteredItems =
    roleFilter.length > 0 ? items.filter((c) => roleFilter.includes(c.primary_role)) : items

  const columns: TableProps<CharacterListItem>['columns'] = [
    {
      title: '人物',
      dataIndex: 'canonical_name',
      key: 'canonical_name',
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      title: '角色',
      dataIndex: 'primary_role',
      key: 'primary_role',
      width: 80,
      filters: ROLES.map((r) => ({ text: r, value: r })),
      onFilter: () => true,
      render: (r: string) => <Tag color={roleColor(r)}>{r}</Tag>,
    },
    {
      title: '出场',
      dataIndex: 'chapters_count',
      key: 'chapters_count',
      width: 80,
      sorter: (a, b) => a.chapters_count - b.chapters_count,
      defaultSortOrder: 'descend',
      render: (n: number) => `${n}回`,
    },
    {
      title: '首见',
      dataIndex: 'first_chapter',
      key: 'first_chapter',
      width: 70,
      sorter: (a, b) => a.first_chapter - b.first_chapter,
      render: (n: number) => `ch${n}`,
      responsive: ['md'],
    },
    { title: '别名', dataIndex: 'aliases_count', key: 'aliases_count', width: 60, responsive: ['md'] },
  ]

  const tableCard = (
    <Card
      size="small"
      title={
        <Space>
          <span>人物</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            共 {filteredItems.length} 名
            {items.length !== filteredItems.length ? ` / ${items.length}` : ''}
          </Typography.Text>
        </Space>
      }
      extra={
        <Input.Search
          placeholder="搜索…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          allowClear
          style={{ width: isMobile ? 140 : 200 }}
          size="small"
        />
      }
      styles={{ body: { padding: 0, height: 'calc(100% - 38px)' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none' }}
    >
      <Table<CharacterListItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={filteredItems}
        columns={columns}
        rowClassName={(record) => (record.id === selectedId && !isMobile ? 'row-selected' : '')}
        onRow={(record) => ({
          onClick: () => navigate(`/characters/${record.id}`),
          style: { cursor: 'pointer' },
        })}
        onChange={(_p, filters) => {
          setRoleFilter((filters.primary_role as string[] | null) ?? [])
        }}
        pagination={false}
        scroll={{ y: 'calc(100vh - 180px)', x: isMobile ? 'max-content' : undefined }}
        footer={() => (
          <CursorPagination
            cursor={cursor}
            pageSize={PAGE_SIZE}
            shownInPage={filteredItems.length}
            totalSize={totalSize}
            unit="名"
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
          onClose={() => navigate('/characters')}
          title="人物详情"
          styles={{ body: { padding: 0 } }}
        >
          {selectedId !== null && <CharacterDetailPane id={selectedId} />}
        </Drawer>
      </>
    )
  }

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="55%" min="30%">{tableCard}</Splitter.Panel>
      <Splitter.Panel min="25%">
        {selectedId === null ? (
          <EmptyDetail />
        ) : (
          <CharacterDetailPane id={selectedId} />
        )}
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
            从左侧表中选择一个人物查看详情
          </Typography.Text>
        }
      />
    </div>
  )
}

// ============================================================
// CharacterDetailPane — replaces the old drawer. Tabbed detail
// rendered inline as the right pane of the master-detail layout.
// ============================================================

function CharacterDetailPane({ id }: { id: number }) {
  const [data, setData] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'detail' | 'events' | 'poems'>('detail')

  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [eventsLoading, setEventsLoading] = useState(false)

  const [poems, setPoems] = useState<PoemListItem[] | null>(null)
  const [poemsLoading, setPoemsLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setData(null)
    setEvents(null)
    setPoems(null)
    setTab('detail')
    api.character(id).then(setData).finally(() => setLoading(false))
  }, [id])

  useEffect(() => {
    if (tab !== 'events' || events !== null) return
    setEventsLoading(true)
    api
      .events({ participant_id: id, page_size: 1000 })
      .then((r) => setEvents(r.items))
      .finally(() => setEventsLoading(false))
  }, [id, tab, events])

  useEffect(() => {
    if (tab !== 'poems' || poems !== null) return
    setPoemsLoading(true)
    api
      .poems({ author_id: id, page_size: 1000 })
      .then((r) => setPoems(r.items))
      .finally(() => setPoemsLoading(false))
  }, [id, tab, poems])

  return (
    <Card
      size="small"
      title={
        data ? (
          <Space>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {data.canonical_name}
            </Typography.Title>
            <Tag color={roleColor(data.primary_role)}>{data.primary_role}</Tag>
            <Typography.Text type="secondary" style={{ fontSize: 11, fontWeight: 'normal' }}>
              id={data.id}
            </Typography.Text>
          </Space>
        ) : (
          '加载中…'
        )
      }
      styles={{ body: { padding: 0, height: 'calc(100% - 38px)' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none', borderLeft: '1px solid #f0f0f0' }}
    >
      {loading && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      )}
      {data && (
        <Tabs
          activeKey={tab}
          onChange={(k) => setTab(k as any)}
          items={[
            { key: 'detail', label: '详情', children: <DetailBody data={data} /> },
            {
              key: 'events',
              label: `参与事件${events ? ` (${events.length})` : ''}`,
              children: <EventsList loading={eventsLoading} events={events} focalId={id} />,
            },
            {
              key: 'poems',
              label: `作诗${poems ? ` (${poems.length})` : ''}`,
              children: <PoemsList loading={poemsLoading} poems={poems} />,
            },
          ]}
          style={{ padding: '0 14px', height: '100%' }}
          tabBarStyle={{ marginBottom: 8 }}
        />
      )}
    </Card>
  )
}

function DetailBody({ data }: { data: CharacterDetail }) {
  const navigate = useNavigate()
  return (
    <div style={{ height: 'calc(100vh - 188px)', overflowY: 'auto', paddingBottom: 16 }}>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="出场章数">{data.chapters_count} / 120</Descriptions.Item>
        <Descriptions.Item label="首见">第 {data.first_chapter} 回</Descriptions.Item>
        <Descriptions.Item label="参与事件">{data.event_count}</Descriptions.Item>
        <Descriptions.Item label="作诗">{data.poem_count} 首</Descriptions.Item>
        <Descriptions.Item label="标识">
          <Typography.Text code style={{ fontSize: 12 }}>{data.canonical_slug}</Typography.Text>
        </Descriptions.Item>
      </Descriptions>

      {data.aliases.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 14 }}>
            别名 / 通名 ({data.aliases.length})
          </Typography.Title>
          <div style={{ lineHeight: '26px' }}>
            {data.aliases.map((a) => (
              <Tag key={a} style={{ marginBottom: 4 }}>{a}</Tag>
            ))}
          </div>
        </>
      )}

      {data.chapters_appearing.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 14 }}>
            出场章回 ({data.chapters_appearing.length})
          </Typography.Title>
          <div style={{ lineHeight: '22px' }}>
            {data.chapters_appearing.map((n) => (
              <Tag
                color="orange"
                key={n}
                style={{ marginBottom: 3, fontSize: 11, cursor: 'pointer' }}
                onClick={() => navigate(`/chapters/${n}`)}
              >
                {n}
              </Tag>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function EventsList({
  loading,
  events,
  focalId,
}: {
  loading: boolean
  events: EventListItem[] | null
  focalId?: number
}) {
  const navigate = useNavigate()
  if (loading || events === null) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }
  if (events.length === 0) return <Empty description="无相关事件" />
  return (
    <div style={{ height: 'calc(100vh - 188px)', overflowY: 'auto' }}>
      <List
        size="small"
        dataSource={events}
        renderItem={(e) => (
          <List.Item style={{ padding: '10px 0', alignItems: 'flex-start' }}>
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <Tag
                  color="orange"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chapters/${e.chapter}`)}
                >
                  第{e.chapter}回
                </Tag>
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
              <div style={{ fontSize: 12, color: '#595959', margin: '4px 0' }}>{e.summary}</div>
              {e.participant_names.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {e.participant_ids.map((pid, i) => {
                    const name = e.participant_names[i]
                    const isFocal = focalId !== undefined && pid === focalId
                    return (
                      <Tag
                        key={pid}
                        color={isFocal ? 'red' : 'default'}
                        style={{
                          fontSize: 11,
                          marginBottom: 2,
                          cursor: isFocal ? 'default' : 'pointer',
                        }}
                        onClick={() => {
                          if (!isFocal) navigate(`/characters/${pid}`)
                        }}
                      >
                        {name}
                      </Tag>
                    )
                  })}
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    </div>
  )
}

function PoemsList({ loading, poems }: { loading: boolean; poems: PoemListItem[] | null }) {
  const navigate = useNavigate()
  if (loading || poems === null) {
    return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  }
  if (poems.length === 0) return <Empty description="无相关诗词" />
  return (
    <div style={{ height: 'calc(100vh - 188px)', overflowY: 'auto' }}>
      <List
        size="small"
        dataSource={poems}
        renderItem={(p) => (
          <List.Item style={{ padding: '8px 0' }}>
            <div style={{ width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <Tag
                  color="orange"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/chapters/${p.chapter}`)}
                >
                  第{p.chapter}回
                </Tag>
                <Tag color="magenta">{p.form}</Tag>
                <Typography.Link onClick={() => navigate(`/poems/${p.id}`)}>
                  <strong>{p.title || p.first_line.slice(0, 16)}</strong>
                </Typography.Link>
                {p.occasion && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    · {p.occasion}
                  </Typography.Text>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#595959', marginTop: 4 }}>{p.first_line}</div>
              {p.themes.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {p.themes.slice(0, 4).map((t) => (
                    <Tag key={t} style={{ fontSize: 10, padding: '0 4px' }}>{t}</Tag>
                  ))}
                </div>
              )}
            </div>
          </List.Item>
        )}
      />
    </div>
  )
}
