import { FullScreenLoading } from '@/components/common/Loading'

export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-background/80">
      <FullScreenLoading message="加载中..." />
    </div>
  )
}
