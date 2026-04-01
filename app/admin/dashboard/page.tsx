import {
  getOrganizationKPIs, getFormModules, getSubmissionTimeSeries,
  getOrganizationSetupMetrics, getUserDashboardData, checkIsAdmin,
} from '@/app/actions/analytics';
import { DashboardContent } from '@/components/dashboard/dashboard-content';
import { UserDashboardContent } from '@/components/dashboard/user-dashboard-content';

export default async function DashboardPage() {
  const isAdmin = await checkIsAdmin();

  if (isAdmin) {
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

  const userData = await getUserDashboardData('30days');

  return <UserDashboardContent userData={userData} />;
}
