import { TrashPage } from "@/components/settings/trash-page";
import PageBackLink from "@/components/shared/page-back-link";

export const dynamic = "force-dynamic";

export default function Trash() {
  return (
    <div>
      <div className="px-4 pt-4 sm:px-6 lg:px-8">
        <PageBackLink href="/settings" label="Settings" />
      </div>
      <TrashPage />
    </div>
  );
}
