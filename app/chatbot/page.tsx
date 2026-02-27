import { cookies } from 'next/headers'
import { validateSession } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { FormChatbot } from '@/components/FormChatbot'

export default async function ChatbotPage() {
  const cookieStore = await cookies()
  const token = cookieStore.get('auth-token')?.value

  if (!token) {
    redirect('/login')
  }

  const session = await validateSession(token)
  if (!session?.user?.id) {
    redirect('/login')
  }

  return (
    <main className="w-full">
      <FormChatbot userId={session.user.id} />
    </main>
  )
}
