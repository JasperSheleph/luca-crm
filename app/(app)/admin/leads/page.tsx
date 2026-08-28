import { redirect } from "next/navigation";

/**
 * Leads used to be a second, near-identical list whose only extra was bulk
 * assignment — and it shipped without the filters that made bulk assignment
 * usable. It is now the Select mode on /deals, which already has the search
 * and filters. This redirect keeps old links working.
 */
export default function Page() {
  redirect("/deals");
}
