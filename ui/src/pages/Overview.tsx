import { useEffect, useState } from 'react'
import { Card, Col, Row, Statistic, Typography } from 'antd'
import { Column, Pie } from '@ant-design/charts'
import {
  api,
  type CharacterListItem,
  type ChapterListItem,
  type EventListItem,
  type PoemListItem,
  type Stats,
} from '../api'

interface Props {
  onNavigate: (view: string) => void
}

export default function Overview({ onNavigate: _onNavigate }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [chapters, setChapters] = useState<ChapterListItem[]>([])
  const [topChars, setTopChars] = useState<CharacterListItem[]>([])
  const [eventSample, setEventSample] = useState<EventListItem[]>([])
  const [poemSample, setPoemSample] = useState<PoemListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.stats(),
      api.chapters(),
      api.characters({ page_size: 12, sort: 'chapters' }),
      // Sample enough events/poems to derive type/form distributions.
      api.events({ page_size: 1000 }),
      api.poems({ page_size: 1000 }),
    ])
      .then(([s, c, ch, ev, pm]) => {
        setStats(s)
        setChapters(c)
        setTopChars(ch.items)
        setEventSample(ev.items)
        setPoemSample(pm.items)
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false))
  }, [])

  if (err) {
    return (
      <div style={{ padding: 24, color: '#cf1322' }}>
        加载失败：{err}
      </div>
    )
  }
  if (loading || !stats) {
    return <div style={{ padding: 24 }}>加载中…</div>
  }

  const chapterEventData = chapters.map((c) => ({ chapter: c.id, count: c.event_count }))

  const eventTypeCounts: Record<string, number> = {}
  eventSample.forEach((e) => {
    eventTypeCounts[e.kind] = (eventTypeCounts[e.kind] || 0) + 1
  })
  const eventTypeData = Object.entries(eventTypeCounts)
    .map(([type, value]) => ({ type, value }))
    .sort((a, b) => b.value - a.value)

  const poemFormCounts: Record<string, number> = {}
  poemSample.forEach((p) => {
    poemFormCounts[p.form] = (poemFormCounts[p.form] || 0) + 1
  })
  const poemFormData = Object.entries(poemFormCounts)
    .map(([type, value]) => ({ type, value }))
    .sort((a, b) => b.value - a.value)

  const topCharData = topChars.map((c) => ({ name: c.canonical_name, chapters: c.chapters_count }))

  return (
    <div style={{ padding: 16, height: '100%', overflowY: 'auto' }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        知识库总览
      </Typography.Title>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="章回" value={stats.chapters} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="人物（去重后）" value={stats.characters} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="事件" value={stats.events} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card size="small">
            <Statistic title="诗词（已标注）" value={stats.poems_annotated} suffix={`/ ${stats.poems_structural}`} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]}>
        <Col xs={24} lg={16}>
          <Card size="small" title="各章事件密度（120 回）">
            <Column
              data={chapterEventData}
              xField="chapter"
              yField="count"
              height={220}
              color="#b45309"
              axis={{ x: { tickFilter: (d: number) => d % 10 === 1 } }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title="事件类型分布">
            <Pie
              data={eventTypeData}
              angleField="value"
              colorField="type"
              height={220}
              radius={0.85}
              legend={{ color: { position: 'right', layout: { justifyContent: 'center' } } }}
            />
          </Card>
        </Col>
      </Row>

      <Row gutter={[12, 12]} style={{ marginTop: 12 }}>
        <Col xs={24} lg={12}>
          <Card size="small" title="出场最多的人物 (Top 12)">
            <Column
              data={topCharData}
              xField="name"
              yField="chapters"
              height={260}
              color="#a8071a"
              axis={{ x: { labelTransform: 'rotate(-30)' } }}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="诗词体裁分布">
            <Pie
              data={poemFormData}
              angleField="value"
              colorField="type"
              height={260}
              radius={0.85}
              legend={{ color: { position: 'right', layout: { justifyContent: 'center' } } }}
            />
          </Card>
        </Col>
      </Row>
    </div>
  )
}
