# Design: TF-81 — แถบเคสของฉันใต้ Navbar (My Case Bar)

**Branch target:** `feature/TF-81-my-case-bar` (branched off `origin/develop`, independent of open PR #87 / TF-80)

---

## 1. Intent & Why

After a reporter submits an SOS request and leaves the confirmation screen (returning to `/`, `/hotlines`, `/units`, `/survival`, `/en/...`, etc.), they currently see no persistent reminder of their open case code or live status unless their case has already reached `AWAITING_CONFIRMATION` (the TF-58 confirmation banner in `DeviceConfirmationBanner.tsx`). Meanwhile, the existing TF-58 banner sits at the very top of `src/app/layout.tsx` (above `HotlineBar` and `Navbar`, and leaks into staff layouts).

TF-81 extends that existing device-case mechanism into a single compact **"My Case Bar"** directly **below the Navbar** across all public reporter pages (Thai and `/en`) so reporters can immediately glance at their active case code + status (`NEW` through `AWAITING_CONFIRMATION`) and jump straight to `/track/[code]?t=...` — or confirm completion inline when `AWAITING_CONFIRMATION` arrives.

---

## 2. Goals, Non-Goals, Anti-Goals

### Goals
- Show a compact bar beneath the Navbar on all public reporter pages (`/` + App Router `(public)`, `(sos)`, `/en/(info)`, `/en/(form)`) whenever `localStorage` holds one or more open cases from this device.
- Display **only** the case code, short status label (e.g., `"เคสของคุณ FL-2611-0004 · ทีมกำลังมา"` / English equivalent), and primary `"ดูสถานะ"` / `"View status"` link to `/track/[code]?t=...` (or `/en/track/[code]?t=...` under `/en`), plus `"อีก N เคส"` switcher when multiple open cases exist, and a dismiss (`ซ่อน` / `Hide`) button.
- Merge cleanly with TF-58 confirmation in the **same single bar**: when the surfaced case is `AWAITING_CONFIRMATION` (and the device holds a `confirmationToken`), show the TF-58 confirmation UI inside that bar instead of duplicating a second banner, and automatically remove closed cases (`RESOLVED`, `CANCELLED`, `DUPLICATE`, `UNREACHABLE`) from `localStorage`.
- Persist per-case dismissal across reloads; if dismissed while in `NEW`–`ON_SITE`, automatically un-dismiss / resurface the bar once the case transitions to `AWAITING_CONFIRMATION` (and respect a second dismissal at `AWAITING_CONFIRMATION`).
- Gracefully handle offline / network outages using the last known cached status.
- Preserve `/` cold-load gzip budget (`<= 150 KB` total under TF-41; `pwa.spec.ts` measured `148,684 bytes`, leaving ~1.3 KB headroom).

### Non-Goals
- Showing cases created on other devices or via SMS without this device's `localStorage` record (already handled by LINE `/my-cases` or `/track` manual lookup).
- Changing backend `/api/track/[code]`, DB triggers, or `cases` RLS policies.
- Adding LINE login prompts to the public Navbar bar.
- Depending on unmerged PR #87 (`TF-80`); E2E tests and UI links work directly with `origin/develop` and remain forward-compatible when PR #87 merges.

### Anti-Goals
- **No PII in the bar or expanded list**: never render reporter name, phone number, landmark, or coordinates.
- **No staff clutter**: never render on `/rescue/*`, `/unit/*`, `/admin/*`, or `(app)` / `(auth)` pages.
- **No duplicate bar on tracking page**: never show the tracking strip for case `X` when the user is already viewing `/track/X` or `/en/track/X` (while still preserving the TF-58 confirmation prompt on `/track/X` at `AWAITING_CONFIRMATION`).
- **No home-bundle bloat**: do not statically import polling, confirmation actions, or full domain tracking tables into `src/pages/index.tsx` or `Navbar.tsx`.

---

## 3. Constraints

1. **TF-41 Performance Budget on `/`:** `src/pages/index.tsx` has ~1.3 KB gzip headroom before failing `e2e/pwa.spec.ts` (`<= 150,000 bytes`). Zero-case first visits must pay only a tiny loader check against `localStorage` and skip fetching `/api/track` or the bar chunk.
2. **TF-58 & TF-74 Backward Compatibility:**
   - Storage key `"namjaithai:confirmation-cases"` is seeded directly by existing E2E specs (`e2e/tf58-confirm-close.spec.ts`, `e2e/reporter-team-tracking.spec.ts`, `e2e/tf74-duplicate-prompt.spec.ts`) as `[{ caseCode, trackingToken, confirmationToken }]` without `lastStatus` or `dismissedPhase`.
   - `draft-storage.ts` reads `deviceConfirmationTokens` from `readDeviceCases(storage)` for `UPDATE_EXISTING` duplicate reconciliation.
   - `ReporterAccountConfirmation.tsx` returns `null` (`"device"`) when `readDeviceCases(localStorage)` contains `caseCode`, delegating TF-58 confirmation rendering to the device bar.
   - `tf58-confirmation.test.ts` uses `.toEqual(...)` expecting no extraneous `undefined` properties on stored objects.
3. **Static English Routes (`/en`):** English App Router pages must stay statically prerenderable (`I18nProvider` passes `REPORTER_TEXT_EN` from `src/app/en/layout.tsx`; zero cookie reads in server layouts). `Navbar` text parity between `reporter-text.ts` and `reporter-text.en.ts` is enforced by TypeScript.
4. **Mobile Usability (`360px` & `375px`):** Zero horizontal overflow (`scrollWidth <= clientWidth`), clear contrast, touch-friendly controls (`>= 48px` height for primary action/confirmation controls).
5. **Security / Secrets:** Zero hardcoded secrets; keep `trackingToken` strictly inside `href` / `localStorage`, never printed in visible text or logs.

---

## 4. Approaches Considered & Choice

### Approach 1 (Chosen): Dedicated Public Sub-Header Mount + Unified Lazy-Loaded Bar + Extended `device-cases.ts`
- **How:** Remove `<DeviceConfirmationBanner />` from `src/app/layout.tsx` and `<HomeConfirmationLoader />` from `src/pages/_app.tsx`. Mount `<PublicCaseBarLoader />` (a minimal lazy loader checking `localStorage` first) directly **after `</header>`** in each reporter layout: `src/app/(public)/layout.tsx`, `src/app/(sos)/layout.tsx`, `src/app/en/(info)/layout.tsx`, `src/app/en/(form)/layout.tsx`, and `src/pages/index.tsx` (`HomeConfirmationLoader` moved right after `</header>`). Extend `DeviceConfirmationBanner` into the single unified bar component and extend `device-cases.ts` backward-compatibly with optional `lastStatus` and `dismissedPhase`.
- **Tradeoff:** Requires placing the loader mount in 5 layout entry files instead of 2 root files, but guarantees true DOM order beneath `<Navbar />` (never floating above `<HotlineBar />` or `<EnvBanner />`), structurally excludes `/rescue`, `/unit`, `/admin`, and `(app)` routes, works smoothly with App Router `I18nProvider` (including `/en`), and keeps `/` well under the 150 KB TF-41 limit.

### Approach 2 (Rejected): Keep Root Mount + Route Allowlist + React Portal under Navbar
- **How:** Keep `<DeviceConfirmationBanner />` in `src/app/layout.tsx`, guard against staff paths with `usePathname()`, and portal into a placeholder element rendered inside or below `Navbar`.
- **Tradeoff:** Prone to hydration timing and transient DOM portal target misses during App Router soft navigation, still requires modifying `src/pages/index.tsx` / `_app.tsx` separately for `/`, and couples root app chrome tightly to `Navbar` internals.

*(Also ruled out: embedding polling/confirmation UI directly inside `Navbar.tsx`, which is imported synchronously on `/` and would exceed the ~1.3 KB TF-41 gzip budget.)*

---

## 5. Detailed Design

### 5.1 Placement & Bundle Budget
1. Remove `<DeviceConfirmationBanner />` from `src/app/layout.tsx` and `<HomeConfirmationLoader />` from `src/pages/_app.tsx`.
2. Create a tiny client loader (`PublicCaseBarLoader` / reuse updated `HomeConfirmationLoader` semantics) that:
   - Reads `localStorage.getItem("namjaithai:confirmation-cases")` inside `useEffect`.
   - When non-empty (and when a new case is added in-session via `"namjaithai:device-cases"` or `"storage"` event, e.g., right after submitting SOS on `/request` -> navigating or staying in SPA!), dynamically imports `DeviceConfirmationBanner` via `import("./DeviceConfirmationBanner")`.
   - Renders `null` on SSR and when `localStorage` has no valid entries, adding near-zero bytes to `/` initial gzip payload.
3. Place the bar wrapper directly after `</header>` (and before `<main>` or at top of content wrapper, non-sticky so an expanded confirmation card or case switcher never eats `360px` mobile viewport height on scroll) in:
   - `src/pages/index.tsx` (after `</header>`, inside Thai layout; passes/defaults `th`)
   - `src/app/(public)/layout.tsx` (after `</header>`)
   - `src/app/(sos)/layout.tsx` (after `</header>`; on mobile `/request`, `SosWizard` has its own top bar and `<header>` stacks cleanly above `<main>`)
   - `src/app/en/(info)/layout.tsx` (after `</header>`, inherits `I18nProvider locale="en"`)
   - `src/app/en/(form)/layout.tsx` (after `</header>`, inherits `I18nProvider locale="en"`)
4. **Why outside `(app)/layout.tsx` and `(auth)/layout.tsx`:** Staff work surfaces (`/rescue`, `/unit`, `/admin`) live under `(app)/`, so excluding `(app)/` guarantees staff pages never load or show the reporter case bar.

### 5.2 Storage Schema & Dismissal Semantics (`src/features/sos/device-cases.ts`)
Extend `DeviceCaseRef` cleanly while remaining 100% compatible with legacy entries:
```ts
export type DeviceCaseDismissPhase = "TRACKING" | "AWAITING_CONFIRMATION";

export type DeviceCaseRef = {
  caseCode: string;
  trackingToken: string;
  confirmationToken?: string;
  lastStatus?: CaseStatus;
  dismissedPhase?: DeviceCaseDismissPhase;
};
```
Rules:
- **`readDeviceCases(storage)`**:
  - Accepts entries where `caseCode` and `trackingToken` are non-empty strings.
  - Preserves optional `confirmationToken` (only if `typeof === "string"`), optional `lastStatus` (only if valid `CaseStatus`), and optional `dismissedPhase` (`"TRACKING" | "AWAITING_CONFIRMATION"`).
  - Returns clean objects without injecting `undefined` keys (keeps existing `tf58-confirmation.test.ts` deep equality exact).
- **`rememberDeviceCase(storage, item)`**:
  - Deduplicates by `caseCode`, appends to end (most recent at index `length - 1`), caps at 20 entries, dispatches `"namjaithai:device-cases"`.
  - When updating metadata (`lastStatus` / `dismissedPhase`), preserve existing tokens rather than wiping `confirmationToken`.
- **Dedicated helpers in `device-cases.ts`**:
  - `updateDeviceCaseStatus(storage, caseCode, status)`: updates `lastStatus`. If `status === CaseStatus.AWAITING_CONFIRMATION` and existing `dismissedPhase === "TRACKING"`, clears `dismissedPhase` so the bar automatically returns for TF-58 confirmation!
  - `dismissDeviceCase(storage, caseCode, phase)`: sets `dismissedPhase = phase` (`"AWAITING_CONFIRMATION"` when currently `AWAITING_CONFIRMATION`, else `"TRACKING"`) and dispatches `"namjaithai:device-cases"` without deleting tokens (so `UPDATE_EXISTING` TF-74 matching and `AWAITING_CONFIRMATION` resurfacing still work!).
  - Note on `sent-case.ts`: call `rememberDeviceCase` even if `sent.confirmationToken` is absent (omitting the property if undefined) with `lastStatus: CaseStatus.NEW` so even LINE-authenticated SOS submissions or edge cases still show in the bar.
  - Note on `draft-storage.ts` line 1558: filter `(item) => item.confirmationToken` to string array (`flatMap`) before sending `deviceConfirmationTokens`.
  - Note on `ReporterAccountConfirmation.tsx`: treat `"device"` only when `item.caseCode === caseCode && Boolean(item.confirmationToken)` so a stored case lacking a confirmation token still allows LINE confirmation on `/track/[code]`.

### 5.3 Polling, Selection, Filtering & Offline Fallback
Inside `DeviceConfirmationBanner`:
1. **Sync across tabs & route changes:** Listen to `visibilitychange`, `"namjaithai:device-cases"`, `"storage"`, `"online"`, and `setInterval(..., 20_000)`. Also read current pathname via `usePathname()` (in App Router) falling back to `window.location.pathname` (in Pages Router `/`), updating on navigation.
2. **Polling logic (`check()`):**
   - Read entries in reverse order (`[...readDeviceCases(localStorage)].reverse()`, newest first).
   - Seed initial UI immediately from stored `lastStatus` (if any, defaulting display to `NEW` short label when `lastStatus` is unknown yet) so the bar does not flicker blank while fetching or when starting offline.
   - Fetch `GET /api/track/${caseCode}?t=${trackingToken}` (`cache: "no-store"`) across open entries (bounded by existing max 20):
     - If `200 OK`:
       - If closed (`RESOLVED`, `CANCELLED`, `DUPLICATE`, `UNREACHABLE`): call `forgetDeviceCase(localStorage, caseCode)`. Note TF-58 `NOT_RECEIVED` resets status to `NEW`, so it stays open and updates `lastStatus` -> `NEW`!
       - If active (`NEW`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`, `AWAITING_CONFIRMATION`): call `updateDeviceCaseStatus(localStorage, caseCode, data.status)` (which automatically clears `dismissedPhase === "TRACKING"` if status is now `AWAITING_CONFIRMATION`).
     - If network error / `offline` / non-200 (`5xx`, `429`): keep entry using its cached `lastStatus` (do NOT delete from `localStorage` on transient errors) and mark an `offline` / stale indicator subtly while still displaying the last known status and `"ดูสถานะ"` button.
3. **Visibility & Priority Selection:**
   - Filter out cases whose effective status is closed.
   - Determine whether user is currently on a tracking page for a specific `caseCode`:
     - Using `stripLocale(currentPath).path`: match `/^\/track\/([^/]+)$/` -> `viewedCaseCode = decodeURIComponent(match[1]).toUpperCase()`.
   - Keep TF-81 safety guard: if `stripLocale(currentPath).path` starts with `/rescue`, `/unit`, `/admin`, `/login`, or `/my-cases`, render `null`.
   - **Determine candidates for display**:
     - For `AWAITING_CONFIRMATION` (when `item.confirmationToken` is present and `item.dismissedPhase !== "AWAITING_CONFIRMATION"`):
       - Eligible everywhere on public routes **including** `/track/${viewedCaseCode}` (so `ReporterAccountConfirmation`'s `"device"` delegation continues working identically for TF-58!).
     - For tracking states (`NEW`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`, or `AWAITING_CONFIRMATION` without `confirmationToken`):
       - Hidden if `caseCode.toUpperCase() === viewedCaseCode` (`ไม่แสดงซ้ำบนหน้าติดตามเคสเดียวกัน`).
       - Hidden if `dismissedPhase === "TRACKING"` (or `"AWAITING_CONFIRMATION"`).
   - **Primary bar item selection:**
     1. First visible case in `AWAITING_CONFIRMATION` (prioritize on `/track/[code]` matching `viewedCaseCode`, otherwise newest `AWAITING_CONFIRMATION` case).
     2. Otherwise, the newest visible tracking case.
   - **Other open cases (`otherOpenCases`):**
     - All other non-dismissed, non-closed open cases on this device excluding the primary displayed case (and excluding `viewedCaseCode` during non-`AWAITING_CONFIRMATION` tracking on `/track/[code]`). If all open cases have been dismissed, the entire bar stays hidden until a case transitions to `AWAITING_CONFIRMATION`.

### 5.4 UI Design & Bilingual Short Status Labels
- **Wrapper styling:** Matches design tokens (`bg-bg-surface` / `bg-primary-50` or `bg-amber-50` when confirming, `border-b border-border-default`, `mx-auto max-w-6xl px-4 py-2 sm:px-6`), zero horizontal overflow on `360px`.
- **Tracking Bar Layout (when status is `NEW`..`ON_SITE`, or `AWAITING_CONFIRMATION` without `confirmationToken`):**
  - Shows concisely in one compact responsive row/wrap:
    - Badge/status dot + text: `"เคสของคุณ FL-2611-0004 · ทีมกำลังมา"` (`EN`: `"Your case FL-2611-0004 · Team on the way"`), plus subtle offline note when the latest refresh failed (`"(สถานะล่าสุด)"` / `"(last known)"` when `stale`).
    - Optional compact button `"อีก {n} เคส"` / `"+{n} more"` (toggles an inline compact list of the remaining open cases, each showing `caseCode` · short status + `"ดูสถานะ"` link).
    - Primary action link `"ดูสถานะ"` / `"View status"` (`min-h-12` / 48px touch target for elderly mobile accessibility while keeping compact horizontal pill padding so `360px` never overflows).
    - Dismiss button (`aria-label="ซ่อนแถบเคส"` / `"Hide case bar"`, visible `"ซ่อน"` / `"Hide"` compact button).
- **Short Status Labels (`caseBar.status` in `reporter-text.ts` & `reporter-text.en.ts`):**
  - `NEW`: `"รอรับเคส"` / `"Waiting"`
  - `ACCEPTED`: `"รับเคสแล้ว"` / `"Accepted"`
  - `EN_ROUTE`: `"ทีมกำลังมา"` / `"Team on the way"`
  - `ON_SITE`: `"ทีมถึงแล้ว"` / `"Arrived"`
  - `AWAITING_CONFIRMATION`: `"รอยืนยันปิดเคส"` / `"Needs confirmation"`
- **Merged TF-58 Confirmation Mode (`AWAITING_CONFIRMATION` + `confirmationToken`):**
  - Renders in the **exact same bar container** (using TF-58 `ConfirmationActions`: `role="region"` with `aria-label={t.confirm.regionLabel}`, keeping existing TF-58 E2E selectors 100% intact!), PLUS a small header row above/beside it showing:
    - Case code + `"ดูสถานะ"` link (unless already on `/track/${caseCode}`) + optional `"อีก N เคส"` + `"ซ่อน"` (`dismissDeviceCase(localStorage, caseCode, "AWAITING_CONFIRMATION")`).
  - When `"ฉันได้รับความช่วยเหลือแล้ว"` (`CONFIRM`) succeeds: calls `forgetDeviceCase` (via `ConfirmationActions`), clears item, moves immediately to next open case if any, otherwise hides bar cleanly.
  - When `"ยังไม่ได้รับ"` (`NOT_RECEIVED`) succeeds: triggers re-check (`revision + 1`), server reopens case to `NEW`, so bar transitions seamlessly back to tracking state `"รอรับเคส"` + `"ดูสถานะ"`!

### 5.5 What's Left to the Builder
- Exact visual tokens (spacing, pill styling, subtle chevron/close icon via `lucide-react` already installed, accessible contrast on `#EEF5FE` / `#FFFFFF` / `#FFF5DC`).
- Helper decomposition (`device-cases.ts` pure functions, `case-bar.ts` pure selection/sorting/filtering helper unit-tested directly without DOM overhead, `DeviceConfirmationBanner.tsx`, `HomeConfirmationLoader.tsx`).
- Writing `e2e/tf81-my-case-bar.spec.ts` using isolated test setup (not relying on unmerged PR #87 / TF-80 pages) plus verifying all existing specs (`e2e/tf58-confirm-close.spec.ts`, `e2e/reporter-team-tracking.spec.ts`, `e2e/shared-layout.spec.ts`, `e2e/pwa.spec.ts`).
