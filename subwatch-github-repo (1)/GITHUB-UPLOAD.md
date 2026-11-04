# Publishing SubWatch to GitHub

Target repository: **`subwatch-subscription-manager`**

Everything is already committed locally (3 commits on `main`), so publishing is a push — not a
re-upload of loose files.

---

## Option A — `git push` (recommended, keeps the commit history)

1. Create an **empty** repo named `subwatch-subscription-manager` on GitHub
   (github.com → **New repository** → no README, no .gitignore, no license).
2. From the `subwatch/` folder:

```bash
git remote add origin https://github.com/<YOUR-USERNAME>/subwatch-subscription-manager.git
git branch -M main
git push -u origin main
```

With the GitHub CLI installed and authenticated (`gh auth login`), steps 1–2 collapse into:

```bash
gh repo create subwatch-subscription-manager --public --source=. --remote=origin --push
```

---

## Option B — upload the ZIP in the browser (no git needed)

1. Create the empty repo as above.
2. Unzip `subwatch-github-repo.zip` (files are at the archive root — **not** nested in a folder).
3. On the repo page: **Add file → Upload files**, drag the whole unzipped contents in, commit.
4. The single commit GitHub creates is fine; the history is cosmetic.

> GitHub's uploader has a 100-file limit and a 25 MB per-file limit. This repo is ~50 files, largest
> file ~800 KB, so it fits.

---

## After the first push — 5-minute setup

| Step | Why |
|---|---|
| **Settings → Security → Dependabot alerts: on** | The CI workflow already runs `npm audit`, this adds notifications |
| **Actions tab → enable workflows** | `CI` type-checks both packages, runs 19 tests, builds, audits |
| **About (top right) → add description + topics** | Suggested: `react`, `typescript`, `express`, `sqlite`, `personal-finance`, `subscriptions`, `tailwindcss` |
| **Add the live link** | About → Website: your deployed URL (see [README → Deploy your own](README.md#deploy-your-own)) |
| **Deploy the demo** | Render → New → Blueprint → pick the repo (uses `render.yaml`), then paste the resulting URL into the About website field |

### What must never be committed

`.gitignore` already excludes them, and the ZIP you have contains none of them:

```
node_modules/   data/   *.db   *.db-shm   *.db-wal   .env   dist/
```

There are no real secrets in the repo. `JWT_SECRET` is read from the environment and the process
refuses to start in production without it; `.env.example` documents every variable.

---

## Repository metadata

**Description**

> Subscription & price-increase detector — track recurring expenses, catch price hikes, and cancel
> what you no longer use. React + TypeScript + Express + SQLite.

**Topics:** `react` `typescript` `nodejs` `express` `sqlite` `tailwindcss` `personal-finance`
`subscriptions` `price-tracking` `full-stack`

**Commits included**

```
feat: SubWatch — subscription & price increase detector
security: harden auth, isolate data, and make type-checking mandatory
docs: refresh screenshots and record security posture in SECURITY.md
```
