import { redirect } from 'next/navigation'

export default function Home() {
  // 重定向到聊天页面
  redirect('/chat')
}
