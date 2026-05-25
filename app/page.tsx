import type { Metadata } from 'next';
import { AdminNav } from '@/components/layout/admin-nav';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getOrganizationKPIs, getFormModules, getSubmissionTimeSeries,
  getOrganizationSetupMetrics, checkIsAdmin,
} from '@/app/actions/analytics';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { UserDashboardContent } from '@/components/dashboard/user-dashboard-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Analytics Dashboard',
  description: 'Advanced analytics and monitoring for your organization',
};

export default async function HomePage() {
  const cookieStore = cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    redirect('/login');
  }

  const session = await validateSession(token);

  if (!session) {
    redirect('/login');
  }

  const isAdmin = await checkIsAdmin();

  const user = {
    email: session.user.email,
    name: (session.user.first_name && session.user.last_name)
      ? `${session.user.first_name} ${session.user.last_name}`
      : session.user.username || session.user.email,
    avatar: session.user.avatar,
    organizationName: session.user.organization?.name,
    role: isAdmin ? 'Admin' : 'User',
  };

  return (
    <div className="flex h-screen  bg-background">
      <div className="w-full">
        {/* <AdminNav user={user} /> */}
        <main className="overflow-auto p-3 sm:p-4 lg:p-8">
          {isAdmin ? (
            <AdminDashboard />
          ) : (
            <UserDashboard />
          )}
        </main>
      </div>
    </div>
  );
}

async function AdminDashboard() {
  const [kpis, modules, timeSeries, setupMetrics] = await Promise.all([
    getOrganizationKPIs('30days'),
    getFormModules(),
    getSubmissionTimeSeries('30days'),
    getOrganizationSetupMetrics(),
  ]);

  return (
    <DashboardContent
      kpis={kpis}
      modules={modules}
      timeSeries={timeSeries}
      setupMetrics={setupMetrics}
    />
  );
}

function UserDashboard() {
  // No server-side data fetch — the user landing page renders a thin
  // shell and the client triggers /api/dashboard/summary on mount via
  // RTK Query. Heavy panels (modules, time series, recent activity) are
  // skipped until the user opens them, which keeps first paint snappy.
  return <UserDashboardContent />;
}