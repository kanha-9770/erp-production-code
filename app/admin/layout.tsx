import type { Metadata } from 'next';
import { AdminNav } from '@/components/admin-nav';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Analytics Dashboard',
  description: 'Advanced analytics and monitoring for your organization',
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    redirect('/login');
  }

  const session = await validateSession(token);

  if (!session) {
    redirect('/login');
  }

  const user = {
    email: session.user.email,
    name: (session.user.first_name && session.user.last_name)
      ? `${session.user.first_name} ${session.user.last_name}`
      : session.user.username || session.user.email,
    avatar: session.user.avatar,
    organizationName: session.user.organization?.name,
  };

  return (
    <div className="flex h-screen bg-background">
      <div className="w-full">
        <AdminNav user={user} />
        <main className="overflow-auto">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}