import { Button, Space, Typography } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import type { CursorState } from './useCursor'

interface Props {
  cursor: CursorState
  pageSize: number
  shownInPage: number
  totalSize: number
  /** Word for the entity ("件" / "首" / "名"). */
  unit?: string
}

/**
 * AIP-158 cursor pagination control: just Prev / Next. No page-number
 * buttons, because the client can't (and shouldn't) construct an
 * arbitrary token.
 */
export function CursorPagination({
  cursor,
  pageSize,
  shownInPage,
  totalSize,
  unit = '',
}: Props) {
  const start = cursor.pageIndex * pageSize + 1
  const end = cursor.pageIndex * pageSize + shownInPage
  return (
    <Space size="middle" style={{ padding: '8px 12px', width: '100%', justifyContent: 'flex-end' }}>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {shownInPage > 0
          ? `${start}–${end} / 共 ${totalSize} ${unit}`
          : `共 ${totalSize} ${unit}`}
      </Typography.Text>
      <Button.Group size="small">
        <Button icon={<LeftOutlined />} disabled={!cursor.hasPrev} onClick={cursor.goPrev}>
          上一页
        </Button>
        <Button disabled={!cursor.hasNext} onClick={cursor.goNext}>
          下一页 <RightOutlined />
        </Button>
      </Button.Group>
    </Space>
  )
}
