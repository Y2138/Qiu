import Link from 'next/link'
import { Button } from '@/components/common/Button'
import { Home } from 'lucide-react'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <h1 className="text-6xl font-bold">404</h1>
      <p className="mt-4 text-xl text-muted-foreground">
        页面未找到
      </p>
      <p className="mt-2 text-muted-foreground">
        对不起，您访问的页面不存在
      </p>
      <Link href="/chat">
        <Button className="mt-8">
          <Home className="mr-2 h-4 w-4" />
          返回首页
        </Button>
      </Link>
    </div>
  )
}
