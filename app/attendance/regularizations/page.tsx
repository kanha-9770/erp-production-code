import { RegularizationsList } from "@/components/attendance/regularizations-list";

export const dynamic = "force-dynamic";

export default function RegularizationsPage() {
  // The component owns the full WorkspaceShell chrome so the page wrapper
  // stays minimal — mirrors the My Attendance / My Leave page pattern.
  return <RegularizationsList />;
}
