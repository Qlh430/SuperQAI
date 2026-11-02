import { Component, type ReactNode } from "react"
import { ErrorPanel } from "@/components/workbench"

// 一处渲染失败只替换这一块内容。以前任何未捕获的渲染错误都会让 React 卸载
// 整棵工作台，页面随即被启动兜底页（"工作台没有正常显示"）接管。
export class PageBoundary extends Component<{ onRetry: () => void; children: ReactNode; fullScreen?: boolean }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: unknown) { console.error("neon workbench render failed", error) }
  render() {
    if (!this.state.failed) return this.props.children
    const panel = <ErrorPanel message="这个页面暂时无法显示，请重试或切换到其它页面。" onRetry={() => { this.setState({ failed: false }); this.props.onRetry() }} />
    return this.props.fullScreen ? <div className="flex min-h-svh items-center justify-center bg-background p-6">{panel}</div> : panel
  }
}
