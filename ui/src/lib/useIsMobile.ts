import { Grid } from 'antd'

/**
 * True when the viewport is narrower than antd's `md` breakpoint (768px).
 * Pages switch from desktop master-detail (Splitter) to a single-column
 * + Drawer pattern when this is true.
 */
export function useIsMobile(): boolean {
  const screens = Grid.useBreakpoint()
  // `md` is undefined during SSR / first paint — treat as mobile to be safe.
  return screens.md === false || screens.md === undefined
}
