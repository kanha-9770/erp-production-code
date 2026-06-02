import type { Metadata } from 'next';
import { validateSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  getFormModules, getSubmissionTimeSeries, getAdminPulse,
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

  // Derive admin status from the session we just validated instead of
  // calling checkIsAdmin() — that helper runs requireAuth(), which validates
  // the session a SECOND time over the network before computing the exact
  // same boolean from unitAssignments. On a remote DB that redundant
  // round-trip was a measurable chunk of the landing-page TTFB. Same logic
  // as /api/auth/me.
  const isOrgOwner = !!(session.user as any).ownedOrganization;
  const hasAdminRole = session.user.unitAssignments.some(
    (ua: any) => ua.role.isAdmin || ua.role.name.toLowerCase().includes('admin'),
  );
  const isAdmin = isOrgOwner || hasAdminRole;
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