"use client";

import { useEffect, useState } from "react";

/**
 * A file in a private bucket, fetched through a short-lived signed URL.
 *
 * Both buckets are private on purpose — the anon key ships in the browser
 * bundle, so a public bucket would let anyone holding it enumerate photographs
 * of customers' homes. The tables store a storage path; this asks
 * /api/files for a URL that expires in five minutes.
 *
 * Signed lazily, when the thing is actually rendered, so opening a deal does
 * not mint URLs for files nobody looks at.
 */
function useSignedUrl(bucket: string, path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!path) return;
    let live = true;
    fetch(`/api/files?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no url"))))
      .then((d: { url: string }) => { if (live) setUrl(d.url); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [bucket, path]);

  return { url, failed };
}

export function VisitPhoto({ path, alt }: { path: string; alt: string }) {
  const { url, failed } = useSignedUrl("visit-photos", path);

  if (failed) {
    return (
      <span className="flex size-20 items-center justify-center rounded-md border border-border bg-navy-50 text-center text-[10px] text-ink-muted">
        Unavailable
      </span>
    );
  }
  if (!url) return <span className="size-20 animate-pulse rounded-md bg-navy-50" aria-hidden="true" />;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      {/* eslint-disable-next-line @next/next/no-img-element -- a signed URL on a
          per-request host is not something next/image can optimise. */}
      <img src={url} alt={alt} className="size-20 rounded-md border border-border object-cover" />
    </a>
  );
}

export function QuoteFile({ path, label }: { path: string; label: string }) {
  const { url, failed } = useSignedUrl("quotes", path);

  if (failed) return <span className="text-xs text-ink-muted">File unavailable</span>;
  if (!url) return <span className="text-xs text-ink-muted">Preparing…</span>;

  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-xs text-navy-700 hover:underline">
      {label}
    </a>
  );
}
