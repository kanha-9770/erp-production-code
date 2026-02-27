import { getOrganizationKPIs, getFormModules, getSubmissionTimeSeries, getOrganizationSetupMetrics } from '@/app/actions/analytics';
import { DashboardContent } from '@/components/dashboard/dashboard-content';

export default async function DashboardPage() {
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
