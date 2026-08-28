"use client";

import { useActionState, useState } from "react";
import {
  previewMetaImport, commitMetaImport,
  type PreviewState, type CommitState,
} from "@/lib/actions/import";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Stat from "@/components/ui/stat";
import { formatDate } from "@/lib/config/design-tokens";

export default function MetaImport() {
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, previewAction, previewPending] = useActionState<PreviewState, FormData>(previewMetaImport, { ok: false });
  const [commit, commitAction, commitPending] = useActionState<CommitState, FormData>(commitMetaImport, { ok: false });

  const p = preview.preview;
  const done = commit.result;

  return (
    <form className="space-y-4">
      <Card
        title="Meta Lead Ads CSV"
        description="Export from Meta, then check the file before importing. Nothing is written until you confirm."
      >
        <input
          type="file" name="file" accept=".csv,text/csv" required
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border-0 file:bg-navy-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-navy-800"
        />
        {fileName && <p className="mt-2 text-xs text-ink-muted">Selected: {fileName}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button formAction={previewAction} variant="secondary" disabled={previewPending || commitPending}>
            {previewPending ? "Checking…" : "Check file"}
          </Button>
          {p && p.willImport > 0 && (
            <Button formAction={commitAction} disabled={commitPending || previewPending}>
              {commitPending ? `Importing ${p.willImport} leads…` : `Import ${p.willImport} leads`}
            </Button>
          )}
        </div>

        {preview.error && <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{preview.error}</p>}
        {commit.error && <p role="alert" className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{commit.error}</p>}
      </Card>

      {p && !done && (
        <Card title="What this file contains" description="Read this before importing.">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            <Stat label="Rows in file" value={p.totalRows} />
            <Stat label="Will import" value={p.willImport} tone="success" />
            <Stat label="Already imported" value={p.alreadyImported} tone="muted" hint={p.alreadyImported > 0 ? "Skipped — safe to re-run" : undefined} />
            <Stat label="Skipped" value={p.skipped.length} tone={p.skipped.length ? "warning" : "neutral"} />
            <Stat label="Invalid phone" value={p.invalidPhoneCount} tone="warning" hint="Imported and flagged, not dropped" />
            <Stat label="Repeat in file" value={p.duplicatesInFile} hint="Same phone, new enquiry" />
            <Stat label="No city given" value={p.missingCity} tone="muted" />
            <Stat label="Bad campaign names" value={p.campaignErrorsCleared} tone="muted" hint="Cleared so reporting stays clean" />
          </div>

          {p.dateRange && (
            <p className="mt-3 rounded-md bg-navy-50 px-3 py-2 text-sm text-ink">
              Leads are dated <strong>{formatDate(p.dateRange.from)}</strong> to <strong>{formatDate(p.dateRange.to)}</strong>.
              These original dates are kept — lead age is measured from them, not from today.
            </p>
          )}

          {p.skipped.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-sm font-medium text-ink">Rows that cannot be imported</p>
              <ul className="space-y-0.5 text-sm text-ink-muted">
                {p.skipped.slice(0, 10).map((s) => (
                  <li key={s.rowNumber}>Row {s.rowNumber}: {s.reason}</li>
                ))}
                {p.skipped.length > 10 && <li>…and {p.skipped.length - 10} more</li>}
              </ul>
            </div>
          )}
        </Card>
      )}

      {done && (
        <Card title="Import finished">
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            <Stat label="Imported" value={done.imported} tone="success" />
            <Stat label="New customers" value={done.newCustomers} />
            <Stat label="Repeat enquiries" value={done.repeatCustomers} />
            <Stat label="Flagged invalid phone" value={done.invalidPhone} tone="warning" />
            <Stat label="Already present" value={done.alreadyImported} tone="muted" />
          </div>
          {done.errors.length > 0 && (
            <div className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
              <p className="font-medium">Some rows failed:</p>
              <ul className="mt-1 space-y-0.5">
                {done.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </div>
          )}
        </Card>
      )}
    </form>
  );
}
