/**
 * /real-estate/agents/[id]/edit
 *
 * The profile page at ../page.tsx is already edit-in-place — status, rank,
 * parent, license, bio are all editable on the same screen and save through
 * one "Save changes" button. The /edit URL is a documented alias so deep
 * links (and the old admin sidebar) continue to land on the same screen
 * instead of 404'ing.
 */

export { default } from "../page";
