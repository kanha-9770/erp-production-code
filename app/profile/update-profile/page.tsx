import { redirect } from "next/navigation"

/**
 * Legacy /profile/update-profile route — inline edit now lives in the
 * Personal tab of the new tabbed /profile shell. Redirect so any links,
 * "Quick Action" tiles, or bookmarks keep working.
 */
export default function UpdateProfileRedirect() {
  redirect("/profile#personal")
}
