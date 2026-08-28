import { requireUser } from "@/lib/auth";
import PageHeader from "@/components/ui/page-header";
import Placeholder from "@/components/ui/placeholder";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  return (
    <>
      <PageHeader title="Deal" subtitle={id} />
      <Placeholder step="Build step 3">
        The timeline is the centrepiece of this screen, not a sidebar. It replaces the
        spreadsheet Remarks column that currently holds entire call histories in one cell.
      </Placeholder>
    </>
  );
}
