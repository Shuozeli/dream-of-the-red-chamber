import { useEffect, useRef, useState } from 'react'
import {
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  List,
  Select,
  Slider,
  Space,
  Spin,
  Splitter,
  Switch,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { ExpandOutlined, ReloadOutlined } from '@ant-design/icons'
import { Graph } from '@antv/g6'
import { useNavigate, useParams } from 'react-router-dom'
import {
  api,
  type CharacterDetail,
  type CharacterListItem,
  type EventListItem,
  type GraphResponse,
} from '../api'
import { useIsMobile } from '../lib/useIsMobile'

function roleStroke(role: string) {
  switch (role) {
    case '主角': return '#a8071a'
    case '配角': return '#d48806'
    case '群众': return '#8c8c8c'
    default: return '#bfbfbf'
  }
}

function roleColor(r: string) {
  return r === '主角' ? 'red' : r === '配角' ? 'gold' : 'default'
}

// Selection drives the drawer. Either a single character (clicked node)
// or a pair (clicked edge) — second mode shows the events the pair shares.
type Selection =
  | { kind: 'character'; id: number }
  | { kind: 'pair'; sourceId: number; targetId: number }

export default function GraphView() {
  const navigate = useNavigate()
  const { id: idParam } = useParams<{ id?: string }>()
  const urlFocal = idParam ? Number(idParam) : null
  const isMobile = useIsMobile()

  const graphRef = useRef<Graph | null>(null)
  const renderSeqRef = useRef(0)
  const [graphHost, setGraphHost] = useState<HTMLDivElement | null>(null)

  const [focalId, setFocalIdState] = useState(urlFocal ?? 2) // 贾宝玉 default
  // Setter that also updates the URL so refresh keeps the focal.
  const setFocalId = (id: number) => {
    setFocalIdState(id)
    navigate(`/graph/${id}`, { replace: true })
  }

  // Sync state ← URL when navigating into /graph/:id from elsewhere.
  useEffect(() => {
    if (urlFocal && urlFocal !== focalId) setFocalIdState(urlFocal)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlFocal])
  const [limit, setLimit] = useState(15)
  const [interconnect, setInterconnect] = useState(false)
  const [data, setData] = useState<GraphResponse | null>(null)
  const [loading, setLoading] = useState(false)

  const [searchOptions, setSearchOptions] = useState<CharacterListItem[]>([])
  const [searching, setSearching] = useState(false)

  // Explicit pair-comparison: when set, the right pane shows
  // (focalId, compareId) shared events regardless of clicks.
  const [compareId, setCompareId] = useState<number | null>(null)
  const [compareSearch, setCompareSearch] = useState<CharacterListItem[]>([])

  const [selection, setSelection] = useState<Selection | null>(null)

  // Effective selection driving the right pane: if compareId is set we
  // always show the pair view (focalId ↔ compareId); otherwise honor the
  // last click on the canvas.
  const effectiveSelection: Selection | null =
    compareId !== null && compareId !== focalId
      ? { kind: 'pair', sourceId: focalId, targetId: compareId }
      : selection

  // ----- character picker -----
  useEffect(() => {
    setSearching(true)
    api
      .characters({ page_size: 50, sort: 'chapters' })
      .then((r) => setSearchOptions(r.items))
      .finally(() => setSearching(false))
  }, [])
  const onSearchCharacter = (q: string) => {
    if (!q) return
    setSearching(true)
    api
      .characters({ q, page_size: 30 })
      .then((r) => setSearchOptions(r.items))
      .finally(() => setSearching(false))
  }
  // Initial seed for the 对比 picker; also drives keyword search.
  useEffect(() => {
    api.characters({ page_size: 50, sort: 'chapters' }).then((r) => setCompareSearch(r.items))
  }, [])
  const onSearchCompare = (q: string) => {
    if (!q) {
      api.characters({ page_size: 50, sort: 'chapters' }).then((r) => setCompareSearch(r.items))
      return
    }
    api.characters({ q, page_size: 30 }).then((r) => setCompareSearch(r.items))
  }

  // ----- fetch graph -----
  useEffect(() => {
    setLoading(true)
    api
      .graph(focalId, { limit, interconnect })
      .then(setData)
      .finally(() => setLoading(false))
  }, [focalId, limit, interconnect])

  // ----- mount G6 once -----
  useEffect(() => {
    if (!graphHost) return
    const graph = new Graph({
      container: graphHost,
      autoFit: 'view',
      autoResize: true,
      layout: {
        type: 'radial',
        unitRadius: 160,
        linkDistance: 160,
        preventOverlap: true,
        nodeSize: 60,
      },
      node: {
        style: (model: any) => {
          const isFocal = !!model.data?.is_focal
          const isCompare = !!model.data?.is_compare
          const role = model.data?.role || ''
          const chapters = model.data?.chapters_count || 0
          const size = Math.min(64, 26 + Math.floor(chapters * 0.35))
          return {
            size,
            fill: isFocal ? '#fff7e6' : isCompare ? '#e6f4ff' : '#ffffff',
            stroke: isCompare ? '#1d39c4' : roleStroke(role),
            lineWidth: isFocal || isCompare ? 4 : 2,
            labelText: model.data?.name,
            labelFill: '#262626',
            labelFontSize: 13,
            labelPlacement: 'bottom',
            labelBackground: true,
            labelBackgroundFill: 'rgba(255,255,255,0.85)',
            labelBackgroundRadius: 3,
            labelPadding: [1, 4],
          }
        },
        state: {
          hover: { lineWidth: 4, stroke: '#b45309' },
          selected: { lineWidth: 4, stroke: '#b45309', fill: '#fff7e6' },
        },
      },
      edge: {
        style: (model: any) => {
          const w = model.data?.weight || 1
          const highlighted = !!model.data?.highlight
          return {
            lineWidth: highlighted
              ? Math.max(3, Math.min(7, Math.log2(w + 1) + 2))
              : Math.max(1, Math.min(5, Math.log2(w + 1))),
            stroke: highlighted ? '#1d39c4' : '#bfbfbf',
            strokeOpacity: highlighted ? 0.95 : 0.65,
            labelText: highlighted ? `${w} 件共同事件` : w > 30 ? String(w) : '',
            labelFill: highlighted ? '#1d39c4' : '#8c8c8c',
            labelFontSize: highlighted ? 12 : 10,
          }
        },
        state: {
          hover: { stroke: '#b45309', strokeOpacity: 1, lineWidth: 3 },
        },
      },
      behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element', 'click-select'],
    })
    graphRef.current = graph

    graph.on('node:click', (e: any) => {
      const id = Number(e.target.id)
      if (!Number.isNaN(id)) setSelection({ kind: 'character', id })
    })
    graph.on('node:dblclick', (e: any) => {
      const id = Number(e.target.id)
      if (!Number.isNaN(id)) setFocalId(id)
    })
    graph.on('edge:click', (e: any) => {
      // Edges carry sourceId/targetId in their data payload — see setData below.
      const sourceId = Number(e.target?.data?.sourceId)
      const targetId = Number(e.target?.data?.targetId)
      if (!Number.isNaN(sourceId) && !Number.isNaN(targetId)) {
        setSelection({ kind: 'pair', sourceId, targetId })
      }
    })

    return () => {
      graph.destroy()
      graphRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphHost])

  // ----- push fresh data to G6 (with explicit clear to avoid stale nodes) -----
  useEffect(() => {
    const g = graphRef.current
    if (!g || !data) return
    const seq = ++renderSeqRef.current
    // G6 v5 keeps node positions + states when ids overlap between datasets,
    // which makes the previous focal "stick" after switching focus. Clearing
    // the graph first forces a full re-layout from scratch.
    const nextData = {
      nodes: data.nodes.map((n) => ({
        id: String(n.id),
        data: {
          name: n.name,
          role: n.role,
          chapters_count: n.chapters_count,
          weight: n.weight,
          is_focal: n.is_focal,
          is_compare: compareId !== null && n.id === compareId,
        },
      })),
      edges: data.edges.map((e, i) => {
        const isPairEdge =
          compareId !== null &&
          ((e.source === focalId && e.target === compareId) ||
            (e.source === compareId && e.target === focalId))
        return {
          id: `e${i}`,
          source: String(e.source),
          target: String(e.target),
          data: {
            weight: e.weight,
            sourceId: e.source,
            targetId: e.target,
            highlight: isPairEdge,
          },
        }
      }),
    }

    ;(async () => {
      await (g as any).clear?.()
      if (seq !== renderSeqRef.current || graphRef.current !== g) return
      g.setData(nextData)
      await g.render()
    })().catch((e) => {
      // Keep the rest of the page usable if G6 rejects during a resize/render race.
      console.error('Failed to render relationship graph', e)
    })
  }, [data, compareId, focalId])

  const fit = () => graphRef.current?.fitView?.()

  const graphCard = (
    <Card
      size="small"
      title={
        <Space>
          <span>关系图</span>
          <Typography.Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            {data?.focal.canonical_name || '…'} · {data?.nodes.length ?? 0} 节点
            {!isMobile && data && (
              <span style={{ marginLeft: 8, color: '#bfbfbf' }}>
                单击节点 · 双击换焦点 · 单击边
              </span>
            )}
          </Typography.Text>
        </Space>
      }
      extra={
        <Space size={4} wrap>
          <Select
            size="small"
            showSearch
            value={focalId}
            onSearch={onSearchCharacter}
            onChange={(v) => setFocalId(v)}
            filterOption={false}
            loading={searching}
            options={searchOptions.map((c) => ({
              value: c.id,
              label: `${c.canonical_name}  (${c.chapters_count}回)`,
            }))}
            style={{ width: isMobile ? 110 : 150 }}
            placeholder="聚焦"
          />
          <Select
            size="small"
            showSearch
            allowClear
            value={compareId ?? undefined}
            onSearch={onSearchCompare}
            onChange={(v) => setCompareId(v ?? null)}
            filterOption={false}
            options={compareSearch
              .filter((c) => c.id !== focalId)
              .map((c) => ({
                value: c.id,
                label: `${c.canonical_name}  (${c.chapters_count}回)`,
              }))}
            style={{ width: isMobile ? 110 : 150 }}
            placeholder="对比"
          />
          {!isMobile && (
            <Slider
              min={5}
              max={40}
              step={5}
              value={limit}
              onChangeComplete={setLimit}
              style={{ width: 70 }}
            />
          )}
          {!isMobile && (
            <Switch size="small" checked={interconnect} onChange={setInterconnect} />
          )}
          <Button size="small" icon={<ExpandOutlined />} onClick={fit} title="自适应" />
          <Button size="small" icon={<ReloadOutlined />} loading={loading} title="刷新" />
        </Space>
      }
      styles={{ body: { padding: 0, height: 'calc(100% - 38px)', background: '#fafaf7' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none' }}
    >
      <div ref={setGraphHost} style={{ width: '100%', height: '100%' }} />
    </Card>
  )

  if (isMobile) {
    return (
      <>
        {graphCard}
        <Drawer
          open={effectiveSelection !== null}
          placement="bottom"
          height="65%"
          onClose={() => setSelection(null)}
          title={effectiveSelection?.kind === 'pair' ? '两人共同事件' : '人物详情'}
          styles={{ body: { padding: 0 } }}
        >
          <SelectionPane
            selection={effectiveSelection}
            onClose={() => setSelection(null)}
            onFocus={(id) => setFocalId(id)}
            onCompare={(id) => setCompareId(id)}
          />
        </Drawer>
      </>
    )
  }

  return (
    <Splitter style={{ height: '100%' }}>
      <Splitter.Panel defaultSize="68%" min="40%">{graphCard}</Splitter.Panel>
      <Splitter.Panel min="20%">
        <SelectionPane
          selection={effectiveSelection}
          onClose={() => setSelection(null)}
          onFocus={(id) => setFocalId(id)}
          onCompare={(id) => setCompareId(id)}
        />
      </Splitter.Panel>
    </Splitter>
  )
}

// ============================================================
// SelectionPane — right side panel. Single-character (node click)
// or pair (edge click). Pair mode loads events including both chars.
// ============================================================

interface SelectionProps {
  selection: Selection | null
  onClose: () => void
  onFocus: (id: number) => void
  onCompare: (id: number) => void
}

function SelectionPane({ selection, onClose: _onClose, onFocus, onCompare }: SelectionProps) {
  if (selection === null) {
    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#fafaf7',
          borderLeft: '1px solid #f0f0f0',
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              点击节点查看人物 · 点击边查看两人共同事件
            </Typography.Text>
          }
        />
      </div>
    )
  }
  return (
    <Card
      size="small"
      title={selection.kind === 'character' ? '人物详情' : '两人共同事件'}
      styles={{ body: { padding: 12, height: 'calc(100% - 38px)', overflowY: 'auto' } }}
      style={{ height: '100%', borderRadius: 0, border: 'none', borderLeft: '1px solid #f0f0f0' }}
    >
      {selection.kind === 'character' && (
        <CharacterDrawerBody id={selection.id} onFocus={onFocus} onCompare={onCompare} />
      )}
      {selection.kind === 'pair' && (
        <PairDrawerBody sourceId={selection.sourceId} targetId={selection.targetId} onFocus={onFocus} />
      )}
    </Card>
  )
}

function CharacterDrawerBody({
  id,
  onFocus,
  onCompare,
}: {
  id: number
  onFocus: (id: number) => void
  onCompare: (id: number) => void
}) {
  const [data, setData] = useState<CharacterDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.character(id).then(setData).finally(() => setLoading(false))
  }, [id])

  if (loading) return <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
  if (!data) return <Empty />

  return (
    <>
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }}>
        <Typography.Title level={4} style={{ margin: 0 }}>{data.canonical_name}</Typography.Title>
        <Tag color={roleColor(data.primary_role)}>{data.primary_role}</Tag>
        <Button size="small" onClick={() => onFocus(data.id)}>设为焦点</Button>
        <Button size="small" type="primary" ghost onClick={() => onCompare(data.id)}>
          与焦点对比
        </Button>
      </Space>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="出场">{data.chapters_count} / 120 回</Descriptions.Item>
        <Descriptions.Item label="首见">第 {data.first_chapter} 回</Descriptions.Item>
        <Descriptions.Item label="事件">{data.event_count}</Descriptions.Item>
        <Descriptions.Item label="作诗">{data.poem_count} 首</Descriptions.Item>
      </Descriptions>
      {data.aliases.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 14 }}>别名 ({data.aliases.length})</Typography.Title>
          <div style={{ lineHeight: '24px' }}>
            {data.aliases.map((a) => <Tag key={a} style={{ marginBottom: 3 }}>{a}</Tag>)}
          </div>
        </>
      )}
    </>
  )
}

function PairDrawerBody({
  sourceId,
  targetId,
  onFocus,
}: {
  sourceId: number
  targetId: number
  onFocus: (id: number) => void
}) {
  const navigate = useNavigate()
  const [src, setSrc] = useState<CharacterDetail | null>(null)
  const [tgt, setTgt] = useState<CharacterDetail | null>(null)
  const [events, setEvents] = useState<EventListItem[] | null>(null)
  const [activeTab, setActiveTab] = useState<'events' | 'src' | 'tgt'>('events')

  useEffect(() => {
    setSrc(null)
    setTgt(null)
    setEvents(null)
    setActiveTab('events')
    Promise.all([api.character(sourceId), api.character(targetId)]).then(([s, t]) => {
      setSrc(s)
      setTgt(t)
    })
    api
      .events({ participants: `${sourceId},${targetId}`, page_size: 1000 })
      .then((r) => setEvents(r.items))
  }, [sourceId, targetId])

  // Relationship summary: event-type distribution + shared chapters span.
  const summary = (() => {
    if (!events) return null
    const kinds: Record<string, number> = {}
    const chapters = new Set<number>()
    for (const e of events) {
      kinds[e.kind] = (kinds[e.kind] ?? 0) + 1
      chapters.add(e.chapter)
    }
    const sortedKinds = Object.entries(kinds).sort((a, b) => b[1] - a[1])
    const chapterList = Array.from(chapters).sort((a, b) => a - b)
    return { sortedKinds, chapterList }
  })()

  return (
    <>
      <Space style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <Tag
          color="orange"
          style={{ fontSize: 14, padding: '2px 8px', cursor: 'pointer' }}
          onClick={() => onFocus(sourceId)}
        >
          {src?.canonical_name ?? '…'}
        </Tag>
        <span style={{ color: '#1d39c4', fontWeight: 600 }}>↔</span>
        <Tag
          color="blue"
          style={{ fontSize: 14, padding: '2px 8px', cursor: 'pointer' }}
          onClick={() => onFocus(targetId)}
        >
          {tgt?.canonical_name ?? '…'}
        </Tag>
      </Space>

      {summary && (
        <Descriptions size="small" column={1} bordered style={{ marginBottom: 12 }}>
          <Descriptions.Item label="共同事件">
            <strong>{events!.length}</strong> 件
            {summary.sortedKinds.length > 0 && (
              <span style={{ marginLeft: 8 }}>
                {summary.sortedKinds.slice(0, 5).map(([k, n]) => (
                  <Tag color="geekblue" key={k} style={{ fontSize: 11 }}>
                    {k} · {n}
                  </Tag>
                ))}
                {summary.sortedKinds.length > 5 && (
                  <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                    +{summary.sortedKinds.length - 5}
                  </Typography.Text>
                )}
              </span>
            )}
          </Descriptions.Item>
          <Descriptions.Item label="跨越章回">
            <strong>{summary.chapterList.length}</strong> 回
            {summary.chapterList.length > 0 && (
              <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }}>
                (第 {summary.chapterList[0]} 回 — 第 {summary.chapterList[summary.chapterList.length - 1]} 回)
              </span>
            )}
          </Descriptions.Item>
        </Descriptions>
      )}

      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={(k) => setActiveTab(k as any)}
        items={[
          {
            key: 'events',
            label: `共同事件${events ? ` (${events.length})` : ''}`,
            children:
              events === null ? (
                <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
              ) : events.length === 0 ? (
                <Empty description="此二人未在同一事件中共现" />
              ) : (
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
                              const isPair = pid === sourceId || pid === targetId
                              return (
                                <Tag
                                  key={pid}
                                  color={isPair ? (pid === sourceId ? 'orange' : 'blue') : 'default'}
                                  style={{ fontSize: 11, marginBottom: 2, cursor: 'pointer' }}
                                  onClick={() => onFocus(pid)}
                                >
                                  {e.participant_names[i]}
                                </Tag>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </List.Item>
                  )}
                />
              ),
          },
          {
            key: 'src',
            label: src?.canonical_name ?? '甲',
            children: src ? (
              <MiniCharacterCard data={src} onFocus={onFocus} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ),
          },
          {
            key: 'tgt',
            label: tgt?.canonical_name ?? '乙',
            children: tgt ? (
              <MiniCharacterCard data={tgt} onFocus={onFocus} />
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>
            ),
          },
        ]}
      />
    </>
  )
}

function MiniCharacterCard({ data, onFocus }: { data: CharacterDetail; onFocus: (id: number) => void }) {
  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Tag color={roleColor(data.primary_role)}>{data.primary_role}</Tag>
        <Button size="small" onClick={() => onFocus(data.id)}>聚焦</Button>
      </Space>
      <Descriptions size="small" column={1} bordered>
        <Descriptions.Item label="出场">{data.chapters_count} / 120 回</Descriptions.Item>
        <Descriptions.Item label="首见">第 {data.first_chapter} 回</Descriptions.Item>
        <Descriptions.Item label="事件">{data.event_count}</Descriptions.Item>
        <Descriptions.Item label="作诗">{data.poem_count} 首</Descriptions.Item>
      </Descriptions>
    </>
  )
}
