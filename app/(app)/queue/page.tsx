import { redirect } from "next/navigation";
import { TO_CALL_PRESET } from "@/lib/navigation";

/**
 * The work queue was specified as a screen of its own. It is not one: /deals
 * already answered two of its five buckets as filters, and a second
 * near-identical list beside Deals is the mistake /admin/leads already made.
 * The queue is now presets on /deals — a filter combination plus an
 * oldest-first sort. This redirect keeps old links and bookmarks working.
 */
export default function Page() {
  redirect(TO_CALL_PRESET);
}
