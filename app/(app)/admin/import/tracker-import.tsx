"use client";

import { useActionState, useState } from "react";
import Button from "@/components/ui/button";
import Card from "@/components/ui/card";
import Badge from "@/components/ui/badge";
import Stat from "@/components/ui/stat";
import { inputBase } from "@/components/ui/field";
import {
  previewTrackerImport, commitTrackerImportAction,
  type TrackerPreviewState, type TrackerCommitState,
} from "@/lib/actions/import";
import { STAGE_LABELS } from "@/lib/config/design-tokens";
import type { DealStage } from "@/lib/domain/stages";

/**
 * Importer B.
 *
 * Preview then commit, with a typed confirmation between them. This writes
 * ~700 deals and thousands of activities, and `activities` is append-only with
 * no delete grant — a bad run cannot be cleanly undone, so the friction is the
 * point.
 */
export default function TrackerImport() {
  const [preview, previewAction, previewing] =
    useActionState<TrackerPreviewState, FormData>(previewTrackerImport, { ok: false });
  const [commit, commitAction, committing] =
    useActionState<TrackerCommitState, FormData>(commitTrackerImportAction, { ok: false });

  const [file, setFile] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  const [year, setYear] = useState("2026");

  const p = preview.preview;
  const done = commit.result;

  return (
    <Card
      title="Legacy sales tracker"
      description="Their working file. Run this after the Meta import — the order is required, not incidental."
    >
      <div className="space-y-4">
        <form action={previewAction} className="space-y-3">
          <input
            type="file" name="file" accept=".csv,text/csv" required
            onChange={(e) => setFile(e.target.files?.[0]?.name ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-paper file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
          />

          {/* 1,537 rows are dates like "2 May" with no year. Defaulting to the
              current year would silently mis-date the whole import the moment
              this is re-run in January. */}
          <label className="flex flex-wrap items-center gap-2 text-sm text-ink">
            Year for dates like &ldquo;2 May&rdquo;
            <input
              name="default_year" type="number" min="2020" max="2100"
              value={year} onChange={(e) => setYear(e.target.value)}
              className={`${inputBase} w-24`}
            />
            <span className="text-xs text-ink-muted">1,537 rows carry no year</span>
          </label>

          <Button size="sm" variant="secondary" disabled={previewing}>
            {previewing ? "Reading…" : "Preview — writes nothing"}
          </Button>
        </form>

        {preview.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{preview.error}</p>
        )}

        {p && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Rows read" value={p.parse.totalRows.toLocaleString("en-IN")} />
              <Stat
                label="Attach to an existing deal"
                value={p.plan.matched.toLocaleString("en-IN")}
                hint="No new deal"
              />
              <Stat
                label="New deals"
                value={p.plan.created.toLocaleString("en-IN")}
                hint="Meta never saw these"
              />
              <Stat
                label="Activities written"
                value={p.plan.activitiesToWrite.toLocaleString("en-IN")}
                tone="warning"
                hint="Append-only"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Stage changes" value={p.plan.stageChanges.toLocaleString("en-IN")} />
              <Stat label="Collapsed duplicates" value={p.parse.duplicatesInFile.toLocaleString("en-IN")} tone="muted" />
              <Stat label="Unreadable dates" value={p.parse.unreadableDates.toLocaleString("en-IN")} tone="muted" hint="Imported with no date" />
              <Stat label="No usable phone" value={p.parse.noPhone.toLocaleString("en-IN")} tone="muted" hint="Placeholder, flagged" />
            </div>

            {p.plan.alreadyImported > 0 && (
              <p className="rounded-md bg-navy-50 px-3 py-2 text-sm text-ink-muted">
                {p.plan.alreadyImported.toLocaleString("en-IN")} rows were imported by an earlier
                run and will be skipped. Re-running this file is safe.
              </p>
            )}

            {/* This is what turns the funnel from one bar into a pipeline. */}
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink">Where the tracker says these deals are</p>
              <ul className="flex flex-wrap gap-1.5">
                {Object.entries(p.plan.stageBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([stage, n]) => (
                    <li key={stage}>
                      <Badge tone="neutral">
                        {STAGE_LABELS[stage as DealStage] ?? stage} · {n}
                      </Badge>
                    </li>
                  ))}
              </ul>
            </div>

            {p.plan.repsUnresolved.length > 0 && (
              <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                <strong>{p.plan.repsUnresolved.join(", ")}</strong> {p.plan.repsUnresolved.length === 1 ? "is" : "are"} not
                in the rep initials map, so {p.plan.repsUnresolved.length === 1 ? "that rep&rsquo;s" : "those reps&rsquo;"} deals
                will import with nobody attached. This is the only historical rep data there is —
                fill the map in Admin → Settings first if you want it kept.
              </p>
            )}

            {p.parse.unrecognisedStatuses.length > 0 && (
              <details className="rounded-md border border-border px-3 py-2">
                <summary className="cursor-pointer text-sm text-ink">
                  {p.parse.unrecognisedStatuses.length} status values were not recognised
                </summary>
                <p className="mt-1.5 text-xs text-ink-muted">
                  These import as Qualifying with the original text kept in the note. Nothing is lost;
                  they are free-text sentences rather than statuses.
                </p>
                <ul className="mt-2 space-y-0.5 text-xs text-ink-muted">
                  {p.parse.unrecognisedStatuses.slice(0, 25).map((s) => <li key={s}>{s}</li>)}
                </ul>
              </details>
            )}

            {p.sample.length > 0 && (
              <details className="rounded-md border border-border px-3 py-2" open>
                <summary className="cursor-pointer text-sm text-ink">
                  Sample of what will happen, row by row
                </summary>
                <ul className="mt-2 space-y-1.5 text-xs">
                  {p.sample.map((r) => (
                    <li key={r.phoneKey} className="flex flex-wrap items-baseline gap-x-2">
                      <Badge tone={r.path === "matched" ? "neutral" : "success"}>
                        {r.path === "matched" ? "attach" : "new deal"}
                      </Badge>
                      <span className="text-ink">{r.name || "(no name)"}</span>
                      <span className="tabular text-ink-muted">
                        row{r.rowNumbers.length > 1 ? "s" : ""} {r.rowNumbers.join(", ")}
                      </span>
                      {r.stageFrom && r.stageTo && (
                        <span className="text-ink-muted">
                          {STAGE_LABELS[r.stageFrom]} → <strong className="text-ink">{STAGE_LABELS[r.stageTo]}</strong>
                        </span>
                      )}
                      {!r.stageFrom && r.stageTo && r.path === "created" && (
                        <span className="text-ink-muted">as {STAGE_LABELS[r.stageTo]}</span>
                      )}
                      <span className="text-ink-muted">· {r.activityCount} activities</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}

            {/* Re-submits the same file: a server action cannot hold one between
                two forms, and re-picking it is the honest way to be sure the
                thing being committed is the thing that was previewed. */}
            {!done && (
              <form action={commitAction} className="space-y-2 rounded-md border border-warning/30 bg-warning/5 p-3">
                <p className="text-sm font-medium text-ink">Commit</p>
                <p className="text-xs text-ink-muted">
                  This writes {p.plan.created.toLocaleString("en-IN")} deals and{" "}
                  {p.plan.activitiesToWrite.toLocaleString("en-IN")} activities. Activities are
                  append-only and cannot be deleted, so this cannot be cleanly undone.
                  Choose the same file again and type IMPORT.
                </p>
                <input
                  type="file" name="file" accept=".csv,text/csv" required
                  className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-md file:border file:border-border file:bg-paper file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-ink"
                />
                <input type="hidden" name="default_year" value={year} />
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    name="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type IMPORT" aria-label="Type IMPORT to confirm"
                    className={`${inputBase} w-40`}
                  />
                  <Button size="sm" disabled={committing || confirm.trim().toUpperCase() !== "IMPORT"}>
                    {committing ? "Importing…" : "Import"}
                  </Button>
                </div>
                {file && <p className="text-xs text-ink-muted">Previewed: {file}</p>}
              </form>
            )}
          </div>
        )}

        {commit.error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">{commit.error}</p>
        )}

        {done && (
          <div className="space-y-2 border-t border-border pt-4">
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">Import complete.</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Deals created" value={done.dealsCreated.toLocaleString("en-IN")} />
              <Stat label="Customers created" value={done.customersCreated.toLocaleString("en-IN")} />
              <Stat label="Stages advanced" value={done.stagesAdvanced.toLocaleString("en-IN")} />
              <Stat label="Activities written" value={done.activitiesWritten.toLocaleString("en-IN")} />
            </div>
            {done.errors.length > 0 && (
              <div className="rounded-md bg-danger/10 px-3 py-2">
                <p className="text-sm font-medium text-danger">
                  {done.errors.length} problem{done.errors.length === 1 ? "" : "s"} — some rows may be incomplete
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-danger">
                  {done.errors.slice(0, 10).map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
