import type { Metadata } from 'next';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getFormModules, getSubmissionTimeSeries,
  checkIsAdmin, getAdminPulse,
} from '@/app/actions/analytics';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { UserDashboardContent } from '@/components/dashboard/user-dashboard-content';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin Analytics Dashboard',
  description: 'Advanced analytics and monitoring for your organization',
};

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;

  if (!token) {
    redirect('/login');
  }

  const session = await validateSession(token);

  if (!session) {
    redirect('/login');
  }

  const isAdmin = await checkIsAdmin();
  const organizationName = session.user.organization?.name ?? '';

  return (
    <div className="flex h-screen  bg-background">
      <div className="w-full">
        <main className="overflow-auto p-3 sm:p-4 lg:p-8">
          {isAdmin ? (
            <AdminDashboard organizationName={organizationName} />
          ) : (
            <UserDashboard />
          )}
        </main>
      </div>
    </div>
  );
}

async function AdminDashboard({ organizationName }: { organizationName: string }) {
  const [pulse, modules, timeSeries] = await Promise.all([
    getAdminPulse(),
    getFormModules(),
    getSubmissionTimeSeries('30days'),
  ]);

  return (
    <DashboardContent
      organizationName={organizationName}
      pulse={pulse}
      modules={modules}
      timeSeries={timeSeries}
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