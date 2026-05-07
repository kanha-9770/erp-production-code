import { redirect } from "next/navigation"

/**
 * Legacy /profile/security route — security now lives inside the tabbed
 * /profile shell. Redirect so any existing bookmarks land in the right place.
 */
export default function SecurityRedirect() {
  redirect("/profile#security")
}
