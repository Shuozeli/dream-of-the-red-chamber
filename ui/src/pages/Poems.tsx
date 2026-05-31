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
import { api, type PoemDetail, type PoemListItem } from '../api'
import { useIsMobile } from '../lib/useIsMobile'
import { useCursor } from '../lib/useCursor'
import { CursorPagination } from '../lib/CursorPagination'

const PAGE_SIZE = 50

const POEM_FORMS = ['诗', '词', '曲', '赋', '对联', '灯谜', '酒令', '偈', '判词', '其他']

export default function Poems() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id?: string }>()
  const selectedId = idParam ? Number(idParam) : null
  const isMobile = useIsMobile()

  const [q, setQ] = useState('')
  const [chapterFilter, setChapterFilter] = useState<number | null>(null)
  const [formFilter, setFormFilter] = useState<string | undefined>()
  const [items, setItems] = useState<PoemListItem[]>([])
  const [totalSize, setTotalSize] = useState(0)
  const [loading, setLoading] = useState(false)

  const cursor = useCursor(`${q}|${chapterFilter ?? ''}|${formFilter ?? ''}`)

  useEffect(() => {
    const t = setTimeout(() => {
      setLoading(true)
      api
        .poems({
          q: q || undefined,
          chapter: chapterFilter ?? undefined,
          form: formFilter,
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
  }, [q, chapterFilter, formFilter, cursor.currentToken])

  const columns: TableProps<PoemListItem>['columns'] = [
    { title: '回', dataIndex: 'chapter', key: 'chapter', width: 50 },
    {
      title: '体裁',
      dataIndex: 'form',
      key: 'form',
      width: 65,
      render: (f: string) => <Tag color="magenta">{f}</Tag>,
    },
    { title: '题', dataIndex: 'title', key: 'title', render: (t: string | null, r: PoemListItem) => t ?? <span style={{ color: '#bfbfbf' }}>{r.first_line.slice(0, 14)}…</span> },
    {
      title: '作者',
      dataIndex: 'author_name',
      key: 'author_name',
      width: 100,
      responsive: ['md'],
      render: (a: string | null, r: PoemListItem) =>
        a && r.author_id ? (
          <Tag
            color="orange"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              navigate(`/characters/${r.author_id}`)
            }}
          >
            {a}
          </Tag>
        ) : (
          <span style={{ color: '#bfbfbf' }}>—</span>
        ),
    },
  ]

  const tableCard = (
    <Card
      size="small"
      title={
        <Space>
          <span>诗词</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            共 {totalSize} 首
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
            placeholder="体裁"
            allowClear
            value={formFilter}
            onChange={setFormFilter}
            options={POEM_FORMS.map((f) => ({ value: f, label: f }))}
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
      <Table<PoemListItem>
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={items}
        columns={columns}
        rowClassName={(record) => (record.id === selectedId && !isMobile ? 'row-selected' : '')}
        onRow={(record) => ({
          onClick: () => navigate(`/poems/${record.id}`),
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
            unit="首"
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
          onClose={() => navigate('/poems')}
          title="诗词详情"
          styles={{ body: { padding: 0 } }}
        >
          {selectedId !== null && <PoemDetailPane id={selectedId} />}
        </Drawer>
      </>
    )
  }

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="55%" min="30%">{tableCard}</Splitter.Panel>
      <Splitter.Panel min="25%">
        {selectedId === null ? <EmptyDetail /> : <PoemDetailPane id={selectedId} />}
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
            从左侧表中选择一首诗词
          </Typography.Text>
        }
      />
    </div>
  )
}

function PoemDetailPane({ id }: { id: number }) {
  const navigate = useNavigate()
  const [data, setData] = useState<PoemDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    setData(null)
    api.poem(id).then(setData).finally(() => setLoading(false))
  }, [id])

  return (
    <Card
      size="small"
      title={
        data
          ? `${data.title || data.text.split('\n')[0]?.slice(0, 18) || '诗词'} · 第${data.chapter}回`
          : '加载中…'
      }
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
            <Descriptions.Item label="体裁">
              <Tag color="magenta">{data.form}</Tag>
            </Descriptions.Item>
            {data.title && <Descriptions.Item label="题">{data.title}</Descriptions.Item>}
            <Descriptions.Item label="作者">
              {data.author ? (
                <Tag
                  color="orange"
                  style={{ cursor: 'pointer' }}
                  onClick={() => navigate(`/characters/${data.author!.id}`)}
                >
                  {data.author.canonical_name}
                </Tag>
              ) : data.author_unresolved ? (
                <Typography.Text italic type="secondary">
                  {data.author_unresolved}（未解析）
                </Typography.Text>
              ) : (
                <Typography.Text type="secondary">—</Typography.Text>
              )}
            </Descriptions.Item>
            {data.occasion && <Descriptions.Item label="场合">{data.occasion}</Descriptions.Item>}
            <Descriptions.Item label="章回 / 场">
              <Typography.Link onClick={() => navigate(`/chapters/${data.chapter}`)}>
                第 {data.chapter} 回
              </Typography.Link>
              {' '}· 第 {data.scene_index} 场
            </Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5} style={{ marginTop: 14 }}>原文</Typography.Title>
          <div className="verse">{data.text}</div>

          {data.dedicatees.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 14 }}>所咏 / 赠与</Typography.Title>
              <div style={{ lineHeight: '28px' }}>
                {data.dedicatees.map((d) => (
                  <Tag
                    color="orange"
                    key={d.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/characters/${d.id}`)}
                  >
                    {d.canonical_name}
                  </Tag>
                ))}
              </div>
            </>
          )}

          {data.themes.length > 0 && (
            <>
              <Typography.Title level={5} style={{ marginTop: 14 }}>主题</Typography.Title>
              <div style={{ lineHeight: '26px' }}>
                {data.themes.map((t) => (
                  <Tag key={t}>{t}</Tag>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </Card>
  )
}
