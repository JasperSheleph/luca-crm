# Hosting — what is actually true

Everything here was verified against the live Hostinger API and hPanel on
**2026-09-05**. Where it contradicts `LUCA-CRM-BUILD.md` or
`LUCA-CRM-PREREQUISITES.md`, this file is right and those have been corrected.

**Nothing has been provisioned.** No website, no subdomain, no datacenter
chosen. The account is exactly as it was found.

---

## The short version

- **LUCA's own Hostinger account runs Node.js.** No upgrade is needed and no
  money needs spending. The long-standing note that Node requires Business or
  Cloud was **wrong**.
- **That account is completely empty** — a plan bought on 2026-05-20 and never
  set up. It is not what serves `lucaelevators.com`.
- **The marketing site is in a different Hostinger account**, almost certainly
  the agency's. It holds the live WordPress site, the DNS zone and the mail.
- **Deployment is therefore no longer blocked on anyone.** A free
  `*.hostingersite.com` subdomain gives a public HTTPS URL without DNS, the
  agency, or Vishal. Only `crm.lucaelevators.com` itself needs an outside favour.

---

## The account we have

Signed in as `lucaelevators@gmail.com` — "Luca elevators", a Chennai billing
profile, INR, 2FA enabled, created **2026-05-20 05:48**.

| Thing | Value |
|---|---|
| Subscription | `Azz250VK91YVShzm` — "Single Web Hosting" |
| Internal plan code | `hostinger_starter_v3` |
| Order | `1009369357` (client `1021176797`) |
| Price | ₹3,468/year, auto-renewing, next billing **2028-05-06** |
| Websites | **0** |
| WordPress installs | **0** (checked `owned` *and* `managed`) |
| Domains | **0** |
| Hosting username | none — the API builds routes with an empty account id |

The plan has never been set up. hPanel shows it with an unclicked **Setup**
button, and `hosting_listAvailableDatacentersV1` still offers a datacenter
choice, which only happens before the first website exists.

**So the ₹3,468/year currently buys nothing.** That is not a loss — it is the
CRM's home, already paid for.

## Does it run Node? Yes

The hPanel setup wizard on this plan offers four ways to build, one of which is
**"Push your code, we host it"**, tagged **Node.js** and **Static app**. It is
offered normally, with no upgrade prompt. The others are AI Builder, WordPress,
and PHP/HTML upload.

**Why the old claim was wrong.** Hostinger's support documentation does say
Node.js needs Business or Cloud — but it uses the *global* plan names. India's
lineup is **Single / Premium / Unlimited / Cloud Startup**, with no "Business"
tier at all, and Hostinger's India pricing page lists Node.js on every tier
including Single. The support docs and the product disagree; the product wins.

Do not re-introduce the "Single is PHP-only" claim. It has now cost this project
one round of investigation and nearly cost it an unnecessary upgrade.

### What the platform supports

From `hosting_updateNode_jsBuildSettingsV1`:

- **Node versions:** 18, 20, 22, 24 → pin **22** in `engines` and `.nvmrc`
- **`app_type` includes `next`** — Next.js is a first-class option, not a
  generic Node process
- Configurable root directory, output directory, build script, package manager

`hosting_deployJsApplication` takes an archive of **source only** — explicitly
no build output and no `node_modules`. Hostinger runs the build itself. This is
why `output: "standalone"` is probably *wrong* here: the platform expects to
build and start the app the ordinary way.

The wizard also offers **deploying from a GitHub repository, redeploying on
every commit**. That is likely a better route than pushing archives through the
API, and it removes a manual step from a project with no full-time maintainer.
Both should be compared before item 11 is settled.

**Mumbai is an available datacenter** — the right one for Tamil Nadu. Note that
**creating the first website locks the datacenter for the whole plan**, and
changing it later normally needs Hostinger support. Get it right the first time.

---

## The domain, and the second account

`lucaelevators.com` is a **live WordPress site** — published 2026-05-23, last
edited 2026-07-21, author account `socialdize2021@gmail.com`.

| Fact | Value |
|---|---|
| Registrar | **GoDaddy** — created 2025-05-04, expires **2027-05-04** |
| Nameservers | `ns1.dns-parking.com`, `ns2.dns-parking.com` — Hostinger's |
| Apex A records | `91.108.106.149`, `88.222.243.110` (Hostinger shared, India) |
| `www` | resolves via `...cdn.hstgr.net` — Hostinger's CDN |
| Mail | `mx1.hostinger.com`, `mx2.hostinger.com` |
| `crm.lucaelevators.com` | **does not resolve — free to take** |

The site, the DNS zone and the mail are all on Hostinger, but **not in the
account above** — its website list is empty and the DNS API answers
*"Customer does not own lucaelevators.com domain"*. So a second Hostinger
account exists, and `socialdize2021@gmail.com` is the lead on whose it is.

**What this means in practice:**

- **Registrar and DNS are split.** DNS *records* are edited in that other
  Hostinger account. Changing *nameservers* requires GoDaddy. Do not repoint
  nameservers — that would take the live site and the company's email down.
- Only **one record** is needed from them: an A or CNAME for `crm`. That is a
  small, low-risk ask, and it does not require access to their account.
- Hostinger's own mechanism for sharing is **Account Sharing** — in hPanel the
  plan card's ⋮ menu shows "Grant access". Ask for that rather than a password.

---

## API access from a Claude session

The Hostinger API MCP is configured on Jasper's machine. **It is not in the
repo**, so a session on another machine has none of this and must set it up.

- `~/.hostinger-mcp.sh` — launches one Hostinger MCP server. Reads **only**
  `HOSTINGER_API_TOKEN` out of `.env.local` and `exec`s the server. It
  deliberately does **not** source that file: `.env.local` holds
  `SUPABASE_DB_URL`, and sourcing a Postgres URL in a shell can execute
  characters inside it, besides handing every app secret to an unrelated
  process. Override the file it reads with `HOSTINGER_ENV_FILE`.
- `~/.claude.json` — five servers: `hostinger-hosting`, `hostinger-domains`,
  `hostinger-dns`, `hostinger-billing`, `hostinger-vps`. Backup of the
  pre-change file is at `~/.claude.json.bak-hostinger`.
- The token lives as `HOSTINGER_API_TOKEN` in `.env.local`, which is gitignored
  and **does not travel between machines**. It is a dev-tooling credential; the
  app itself never reads it.
- Generate a token in hPanel under **Dev tools → API**. The config generator
  there writes the token inline into JSON — don't; keep it in `.env.local`.

MCP servers are only loaded at session start, so a session that just added them
must be restarted before the tools appear.

### Tools that matter here

`hosting_createWebsiteV1`, `hosting_generateAFreeSubdomainV1`,
`hosting_createWebsiteSubdomainV1`, `hosting_updateNode_jsBuildSettingsV1`,
`hosting_deployJsApplication`, `hosting_replaceNode_jsEnvironmentVariablesV1`
(item 13), `hosting_getNodeJSBuildLogsV1`, `hosting_getNode_jsRuntimeLogsV1`,
`hosting_restartNode_jsApplicationV1`, `DNS_getDNSRecordsV1`,
`DNS_updateDNSRecordsV1`.

**`billing_createPurchaseOrderV1` and `billing_renewSubscriptionV1` spend real
money.** Nothing in this project should call them.

---

## What is verified, and what is not

**Verified:** the plan runs Node; Next.js is a supported app type; Node 18/20/22/24;
Mumbai available; the account is empty and unprovisioned; the domain topology
above; `crm.` is unclaimed; the API token authenticates and reads correctly.

**Not verified, and worth expecting to be wrong about:**

- Whether the plan's memory and CPU limits are comfortable for Next.js SSR.
  Load is tiny — ~10 users, Supabase holds the data, this host only renders —
  but no build has actually run.
- Whether `output` should stay at its default. The source-only archive strongly
  implies yes; confirm against a real build.
- How many websites the plan allows. Expect one, which is enough.
- Whether the free subdomain gets automatic SSL. Expected, not confirmed.

## Next, in order

1. Provision: free subdomain, **Mumbai**, on order `1009369357`. Remember the
   datacenter locks.
2. Node build settings: version 22, `app_type: next`. Compare the GitHub route
   against archive upload.
3. Env vars via `hosting_replaceNode_jsEnvironmentVariablesV1` — item 13.
   **`SUPABASE_SERVICE_ROLE_KEY` must never be prefixed `NEXT_PUBLIC_`.**
4. Deploy, confirm sign-in over HTTPS — item 14.
5. `npm run cron:setup` with the live URL — item 15. First moment this can work.
6. Confirm a job fires at the right **IST** hour — item 16.
7. Rep check-in on a real phone — item 17. Never once exercised.
8. Only then `crm.lucaelevators.com` — item 12, the one thing needing an
   outside favour.
