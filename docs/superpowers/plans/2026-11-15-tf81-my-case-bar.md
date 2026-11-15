# TF-81 My Case Bar Below Navbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Note: per repo `CLAUDE.md`, do NOT `git commit` or `git push` until explicitly instructed by the user.

**Goal:** Build a single unified lazy-loaded My Case Bar beneath `<Navbar />` on all public Thai and `/en` pages displaying open SOS cases from `localStorage`, live/offline short status, `"ดูสถานะ"` tracking link, multi-case switcher, per-case dismissal (resurfacing on `AWAITING_CONFIRMATION`), and merged TF-58 confirmation controls.

**Architecture:** Extend `device-cases.ts` backward-compatibly with optional `lastStatus` and two-phase `dismissedPhase` (`"TRACKING" | "AWAITING_CONFIRMATION"`), extract pure selection/route-guard rules into `case-bar.ts`, upgrade `DeviceConfirmationBanner.tsx` into the unified sub-Navbar bar loaded on demand by the `"use client"` `HomeConfirmationLoader.tsx`, and move the mount point out of root `src/app/layout.tsx` / `src/pages/_app.tsx` to directly beneath `</header>` in `src/pages/index.tsx`, `(public)/layout.tsx`, `(sos)/layout.tsx`, `en/(info)/layout.tsx`, and `en/(form)/layout.tsx`.

**Tech Stack:** Next.js 16 (Pages Router `/` + App Router public/en), TypeScript, Tailwind CSS v4, Vitest + React SSR/DOM testing, Playwright E2E.

**Spec:** [docs/superpowers/specs/2026-11-15-tf81-my-case-bar-design.md](../specs/2026-11-15-tf81-my-case-bar-design.md)

## Global Constraints

- Cold load on `/` MUST stay `<= 150,000` compressed bytes in `e2e/pwa.spec.ts` (current baseline `148,684 bytes`, ~1.3 KB headroom). `/` and zero-case public visits must only execute the tiny lazy loader check and never eagerly bundle polling or confirmation UI.
- Zero PII in the bar or switcher (`caseCode` and short status only — never name, phone, landmark, or coordinates; keep `trackingToken` inside `href` / `localStorage` only).
- Storage key `"namjaithai:confirmation-cases"` MUST stay backward-compatible with legacy `{ caseCode, trackingToken, confirmationToken }` entries (and `readDeviceCases()` must not emit `undefined` keys that break `.toEqual` in `tf58-confirmation.test.ts`).
- Bar MUST NOT appear on staff routes (`/rescue/*`, `/unit/*`, `/admin/*`), `/login`, `/my-cases`, or duplicate the tracking bar on the same case's `/track/[code]` / `/en/track/[code]` page during `NEW`–`ON_SITE` (while preserving TF-58 `ConfirmationActions` at `AWAITING_CONFIRMATION`).
- Bilingual parity (`REPORTER_TEXT_TH` & `REPORTER_TEXT_EN` exact keys and `{var}` variables, no Thai glyphs in English text) verified by `locale.test.ts`; mobile `360px` and `375px` must have `scrollWidth <= clientWidth` and `>= 48px` primary button targets.

## Review Focus

1. **Corrupt or 404/5xx/rate-limited `/api/track` responses & offline startup:** Network failure, `5xx`, or `429` must preserve the stored entry and render cached `lastStatus` (`stale` offline hint) without deleting user data; only confirmed closed statuses (`RESOLVED`, `CANCELLED`, `DUPLICATE`, `UNREACHABLE`) call `forgetDeviceCase`.
2. **In-flight polling race vs user confirm/reopen/dismiss:** An interval `check()` response returning after the user clicks `"ฉันได้รับความช่วยเหลือแล้ว"`, `"ยังไม่ได้รับ"`, or `"ซ่อน"` must check cancellation/latest `localStorage` state rather than resurrecting stale UI.
3. **In-session SOS creation without page reload:** When `HomeConfirmationLoader` mounted while `localStorage` was initially empty (e.g., `/request` or `/` before SOS submission), dispatching `"namjaithai:device-cases"` or `"storage"` must immediately trigger lazy import of `DeviceConfirmationBanner`.
4. **Multi-case priority when older case hits `AWAITING_CONFIRMATION` or one case is dismissed:** Any non-dismissed `AWAITING_CONFIRMATION` case with `confirmationToken` must surface ahead of newer `NEW`..`ON_SITE` cases; dismissing tracking promotes the next open case and resurfaces automatically upon `AWAITING_CONFIRMATION`.
5. **Encoded / mixed-case `/track/[code]` matching across Thai & `/en`:** URL-encoded or lowercase `/track/fl-2611-0004` and `/en/track/FL-2611-0004` must suppress the tracking bar for that case while keeping another open case switchable if present.

---

### Task 1: Device Case Storage Schema, Dismissal Lifecycle & Downstream Token Consumers

**Files:**
- Modify: `src/features/sos/device-cases.ts`
- Modify: `src/features/sos/sent-case.ts`
- Modify: `src/features/sos/draft-storage.ts`
- Modify: `src/features/sos/components/ReporterAccountConfirmation.tsx`
- Test: `src/features/sos/__tests__/tf58-confirmation.test.ts`
- Test: `src/features/sos/__tests__/tf74-duplicate-submit.test.ts`

**Interfaces:**
- Consumes: `CaseStatus` from `@/lib/domain/case-status`
- Produces in `src/features/sos/device-cases.ts`:
  - `export type DeviceCaseDismissPhase = "TRACKING" | "AWAITING_CONFIRMATION";`
  - `export type DeviceCaseRef = { caseCode: string; trackingToken: string; confirmationToken?: string; lastStatus?: CaseStatus; dismissedPhase?: DeviceCaseDismissPhase };`
  - `export function readDeviceCases(storage: Storage): DeviceCaseRef[]`
  - `export function rememberDeviceCase(storage: Storage, item: DeviceCaseRef): void`
  - `export function forgetDeviceCase(storage: Storage, caseCode: string): void`
  - `export function updateDeviceCaseStatus(storage: Storage, caseCode: string, status: CaseStatus): void`
  - `export function dismissDeviceCase(storage: Storage, caseCode: string, phase: DeviceCaseDismissPhase): void`
- Consumed by Tasks 2, 3 (`device-cases.ts` exports) and existing SOS/TF-74/TF-58 paths.

- [ ] **Step 1: Write failing tests in `src/features/sos/__tests__/tf58-confirmation.test.ts` and `tf74-duplicate-submit.test.ts`**

Add tests in `tf58-confirmation.test.ts` verifying:
1) Legacy object `{ caseCode, trackingToken, confirmationToken }` returned cleanly with no extra keys (`toEqual` regression guard).
2) Entry without `confirmationToken` (and valid/corrupt `lastStatus` / `dismissedPhase` filtering) reads cleanly; corrupt `lastStatus` or non-string `caseCode` is dropped/sanitized.
3) `updateDeviceCaseStatus(store, code, CaseStatus.EN_ROUTE)` saves `lastStatus: EN_ROUTE` while preserving `confirmationToken` and `dismissedPhase: "TRACKING"`.
4) `dismissDeviceCase(store, code, "TRACKING")` sets `dismissedPhase: "TRACKING"`, and subsequent `updateDeviceCaseStatus(store, code, CaseStatus.AWAITING_CONFIRMATION)` clears `dismissedPhase` so confirmation resurfaces; calling `dismissDeviceCase(store, code, "AWAITING_CONFIRMATION")` sets `dismissedPhase: "AWAITING_CONFIRMATION"`.
5) `rememberSentCase` stores case in `localStorage` even when `confirmationToken` is omitted (with `lastStatus: CaseStatus.NEW`), while `draft-storage.ts` `UPDATE_EXISTING` filters out undefined tokens so `deviceConfirmationTokens` stays `string[]`.

- [ ] **Step 2: Run unit tests to verify they fail**

Run: `npx vitest run src/features/sos/__tests__/tf58-confirmation.test.ts src/features/sos/__tests__/tf74-duplicate-submit.test.ts`
Expected: FAIL because `updateDeviceCaseStatus`, `dismissDeviceCase`, and optional-token handling do not exist yet.

- [ ] **Step 3: Implement storage extensions and update consumers**

1. In `src/features/sos/device-cases.ts`:
   - Define `DeviceCaseDismissPhase` and extended `DeviceCaseRef`.
   - Validate entries in `readDeviceCases`: require non-empty `caseCode` & `trackingToken`; include `confirmationToken` only if non-empty string, `lastStatus` only if valid `CaseStatus`, `dismissedPhase` only if `"TRACKING" | "AWAITING_CONFIRMATION"` (never emit `undefined` keys).
   - Update `rememberDeviceCase`: preserve existing `confirmationToken`/`lastStatus`/`dismissedPhase` on merge unless explicitly overridden by `item` (or clear `"TRACKING"`/`"AWAITING_CONFIRMATION"` dismissal if explicitly re-submitted), cap at `-20`, dispatch `"namjaithai:device-cases"`.
   - Update `forgetDeviceCase`: only write storage and dispatch `"namjaithai:device-cases"` when `caseCode` actually existed in storage (avoids redundant no-op refresh loops).
   - Implement `updateDeviceCaseStatus` (note: clearing `dismissedPhase` ONLY when incoming `status === CaseStatus.AWAITING_CONFIRMATION && prev.dismissedPhase === "TRACKING"`, NOT dispatching events if neither `lastStatus` nor `dismissedPhase` actually changed).
   - Implement `dismissDeviceCase` (preserves tokens and dispatches `"namjaithai:device-cases"` when changed).
2. In `src/features/sos/sent-case.ts`:
   - In `rememberSentCase`, always call `rememberDeviceCase(window.localStorage, { caseCode: sent.caseCode, trackingToken: sent.trackingToken, ...(sent.confirmationToken ? { confirmationToken: sent.confirmationToken } : {}), lastStatus: CaseStatus.NEW })`.
3. In `src/features/sos/draft-storage.ts`:
   - Change `deviceConfirmationTokens` mapping to `.flatMap((item) => (item.confirmationToken ? [item.confirmationToken] : []))`.
4. In `src/features/sos/components/ReporterAccountConfirmation.tsx`:
   - Change device check to `readDeviceCases(window.localStorage).some((item) => item.caseCode === caseCode && Boolean(item.confirmationToken))`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/sos/__tests__/tf58-confirmation.test.ts src/features/sos/__tests__/tf74-duplicate-submit.test.ts`
Expected: PASS (all existing + new assertions green).

---

### Task 2: Bilingual Copy & Pure Case-Bar Selection / Route Guard / Sync Logic

**Files:**
- Modify: `src/lib/i18n/reporter-text.ts`
- Modify: `src/lib/i18n/reporter-text.en.ts`
- Create: `src/features/sos/case-bar.ts`
- Create: `src/features/sos/__tests__/tf81-case-bar.test.tsx`
- Verify: `src/lib/i18n/__tests__/locale.test.ts`

**Interfaces:**
- Consumes: `CaseStatus` (`@/lib/domain/case-status`), `stripLocale` (`@/lib/i18n/locale`), `DeviceCaseRef`, `forgetDeviceCase`, `readDeviceCases`, `updateDeviceCaseStatus` (`./device-cases`)
- Produces in `src/lib/i18n/reporter-text.ts` & `.en.ts`:
  - `caseBar`: `{ regionLabel, caseSummary, offlineHint, viewStatus, hideLabel, moreCases, hideMoreCases, otherCasesLabel, confirmBarHeading, status: Record<"NEW" | "ACCEPTED" | "EN_ROUTE" | "ON_SITE" | "AWAITING_CONFIRMATION", string> }`
- Produces in `src/features/sos/case-bar.ts`:
  - `export const CLOSED_DEVICE_STATUSES: ReadonlySet<CaseStatus>`
  - `export type OpenDeviceStatus = "NEW" | "ACCEPTED" | "EN_ROUTE" | "ON_SITE" | "AWAITING_CONFIRMATION"`
  - `export type CaseBarEntry = { ref: DeviceCaseRef; status: OpenDeviceStatus }`
  - `export type ConfirmCaseBarEntry = { ref: DeviceCaseRef & { confirmationToken: string }; status: "AWAITING_CONFIRMATION" }`
  - `export type CaseBarSelection = { mode: "confirm"; primary: ConfirmCaseBarEntry; others: CaseBarEntry[] } | { mode: "track"; primary: CaseBarEntry; others: CaseBarEntry[] } | null`
  - `export function isCaseBarAllowedPath(pathname: string): boolean`
  - `export function trackedCodeFromPath(pathname: string): string | null`
  - `export function initialCaseBarEntries(entries: DeviceCaseRef[]): CaseBarEntry[]`
  - `export function selectCaseBarDisplay(entriesNewestFirst: CaseBarEntry[], pathname: string): CaseBarSelection`
  - `export async function syncDeviceCases(options: { storage: Storage; fetchImpl?: typeof fetch; isCancelled?: () => boolean }): Promise<{ entries: CaseBarEntry[]; stale: boolean }>`

- [ ] **Step 1: Write failing unit tests for route guards, status priority, same-case suppression, sync edge cases & i18n parity**

Create `src/features/sos/__tests__/tf81-case-bar.test.tsx` (running under Vitest's Node environment) testing:
1) `isCaseBarAllowedPath`: false for `/rescue`, `/rescue/`, `/rescue/map`, `/rescue/cases/123`, `/unit`, `/unit/dashboard`, `/admin`, `/admin/cases`, `/login`, `/my-cases`, `/en/login`; true for `/`, `/hotlines`, `/units`, `/survival`, `/request`, `/track`, `/track/FL-2611-0004`, `/en/hotlines`, `/en/request`, `/en/track/FL-2611-0004`.
2) `trackedCodeFromPath`: extracts uppercase decoded code from `/track/fl-2611-0004`, `/en/track/FL-2611-0004/`, `/track/FL%2D2611%2D0004`, safely handles malformed percent encoding (`/%E0%A4`), and returns `null` for `/track`, `/en/track`, `/hotlines`.
3) `selectCaseBarDisplay`:
   - Single tracking case (`NEW`, `ACCEPTED`, `EN_ROUTE`, `ON_SITE`) -> `mode: "track"`.
   - Same-case suppression on `/track/FL-2611-0004` or `/en/track/fl-2611-0004`: returns `null` when it's the only case (`NEW`..`ON_SITE`); surfaces another open case if a second open case exists; STILL returns `mode: "confirm"` on `/track/FL-2611-0004` when `AWAITING_CONFIRMATION` with `confirmationToken` (keeping `others` tracking-filtered).
   - Priority: older case reaching `AWAITING_CONFIRMATION` with `confirmationToken` beats newer `EN_ROUTE` case (`mode: "confirm"`, newest `EN_ROUTE` in `others`).
   - Case in `AWAITING_CONFIRMATION` WITHOUT `confirmationToken`: selects `mode: "track"` (lets `ReporterAccountConfirmation` on `/track` handle LINE confirmation).
   - Dismissal: `dismissedPhase === "TRACKING"` hides during `NEW`..`ON_SITE` and promotes next open case (or `null` if all dismissed), does NOT hide `AWAITING_CONFIRMATION` with token, while `dismissedPhase === "AWAITING_CONFIRMATION"` hides confirmation.
   - Closed statuses (`RESOLVED`, `CANCELLED`, `DUPLICATE`, `UNREACHABLE`) never returned by `initialCaseBarEntries`.
4) `syncDeviceCases` resilience & concurrency races:
   - Network throw / offline reject: preserves stored entry and cached `lastStatus`, returns `stale: true`.
   - HTTP `404`, `500`, `429`, malformed JSON, or payload missing valid `status`: preserves stored entry and cached `lastStatus` (never deletes on transient errors), returns `stale: true`.
   - HTTP `200` with closed status (`RESOLVED`, `CANCELLED`, `DUPLICATE`, `UNREACHABLE`): removes closed case via `forgetDeviceCase` while keeping other open cases.
   - HTTP `200` with `NOT_RECEIVED`-reopened `NEW` status: updates stored `lastStatus` back to `NEW`.
   - In-flight race: if user dismisses or confirms (`forgetDeviceCase`) a case while `fetch` is pending (`isCancelled` returns `true` or storage entry was modified/removed before response resolves), `syncDeviceCases` aborts committing stale UI state and re-reads current storage safely instead of resurrecting deleted/dismissed cases.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sos/__tests__/tf81-case-bar.test.tsx`
Expected: FAIL with missing module `./case-bar`.

- [ ] **Step 3: Add bilingual `caseBar` strings & implement `src/features/sos/case-bar.ts`**

1. Add `caseBar` keys to `src/lib/i18n/reporter-text.ts` (short statuses: `NEW: "รอรับเคส"`, `ACCEPTED: "รับเคสแล้ว"`, `EN_ROUTE: "ทีมกำลังมา"`, `ON_SITE: "ทีมถึงแล้ว"`, `AWAITING_CONFIRMATION: "รอยืนยันปิดเคส"`, `caseSummary: "เคสของคุณ {code}"`, `offlineHint: "(สถานะล่าสุด)"`, `viewStatus: "ดูสถานะ"`, `moreCases: "อีก {count} เคส"`, etc.) and exact matching English keys in `reporter-text.en.ts` (`NEW: "Waiting"`, `ACCEPTED: "Accepted"`, `EN_ROUTE: "Team on the way"`, `ON_SITE: "Arrived"`, `AWAITING_CONFIRMATION: "Needs confirmation"`, `caseSummary: "Your case {code}"`, `offlineHint: "(last known)"`, `viewStatus: "View status"`, `moreCases: "+{count} more"`, etc.).
2. Implement `CLOSED_DEVICE_STATUSES`, `isCaseBarAllowedPath`, `trackedCodeFromPath`, `initialCaseBarEntries`, `selectCaseBarDisplay`, and `syncDeviceCases` in `src/features/sos/case-bar.ts`. Always normalize trailing slashes after `stripLocale`, guard `decodeURIComponent` with `try/catch`, and guard every storage write after `await fetch` against `isCancelled()` and removed storage entries (e.g., check entry still exists in `readDeviceCases(storage)` after `CONFIRM` deleted it while `fetch` was in flight!).

- [ ] **Step 4: Run tests including `locale.test.ts`**

Run: `npx vitest run src/features/sos/__tests__/tf81-case-bar.test.tsx src/lib/i18n/__tests__/locale.test.ts`
Expected: PASS (all TF-81 domain selection, sync resilience, and i18n parity checks green).

---

### Task 3: Unified `DeviceConfirmationBanner` UI & Lazy `HomeConfirmationLoader`

**Files:**
- Modify: `src/features/sos/components/HomeConfirmationLoader.tsx`
- Modify: `src/features/sos/components/DeviceConfirmationBanner.tsx`
- Modify: `src/features/sos/__tests__/tf81-case-bar.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`device-cases.ts`), Task 2 (`case-bar.ts`, `REPORTER_TEXT_*`), `ConfirmationActions`, `useI18n`, `localePath`, `trackPath`, `usePathname` (`next/navigation`)
- Produces in `HomeConfirmationLoader.tsx`:
  - `HomeConfirmationLoader()` (`"use client"`, minimal lazy wrapper reading raw `localStorage.getItem("namjaithai:confirmation-cases")` + listening to `"namjaithai:device-cases"` and `"storage"`, importing `./DeviceConfirmationBanner` only when at least 1 stored case exists)
- Produces in `DeviceConfirmationBanner.tsx`:
  - `export type CaseBarViewProps = { selection: CaseBarSelection; stale: boolean; expanded: boolean; showTrackLinkOnConfirm: boolean; onToggleExpanded: () => void; onDismiss: (entry: CaseBarEntry, mode: "confirm" | "track") => void; onConfirmChanged: () => void }`
  - `export function CaseBarView(props: CaseBarViewProps): JSX.Element | null` (pure presentational bar testable via `renderToStaticMarkup` in Node Vitest)
  - `export function DeviceConfirmationBanner(): JSX.Element | null` (connects `localStorage` + `syncDeviceCases` + pathname/visibility/online listeners to `CaseBarView`)

- [ ] **Step 1: Add failing SSR component & contract tests in `src/features/sos/__tests__/tf81-case-bar.test.tsx`**

Test in Vitest (`renderToStaticMarkup` from `react-dom/server` — matching `my-tasks-view.test.tsx`, since this repo does not install `jsdom`):
1) Renders Thai tracking bar (`data-testid="my-case-bar"`) with default `useI18n()` fallback (verifying Pages Router `/` without `I18nProvider` works cleanly): displays `"เคสของคุณ FL-2611-0004"`, `"ทีมกำลังมา"`, and `"ดูสถานะ"` link `href="/track/FL-2611-0004?t=tok"` with no PII fields (never name/phone/landmark/coords) and no visible raw `trackingToken` outside `href`.
2) Renders English bar wrapped in `<I18nProvider locale="en" text={REPORTER_TEXT_EN}>` with `"Your case FL-2611-0004"`, `"Team on the way"`, and `"View status"` link `href="/en/track/FL-2611-0004?t=tok"`.
3) Renders offline indicator (`stale: true`) alongside last known status without clearing stored entry.
4) Renders multiple open cases (`others.length === 1`) with `"อีก 1 เคส"` button (`aria-expanded={expanded}`), and when `expanded={true}` renders the expanded secondary case code (`FL-...`), short status, and `"ดูสถานะ"` link without PII.
5) Merged TF-58 confirmation (`mode: "confirm"`): renders single bar containing `role="region"` `"ยืนยันการช่วยเหลือ"` alongside optional `"ดูสถานะ"` link (hidden when `showTrackLinkOnConfirm === false` on same `/track/[code]`), without duplicating a second tracking bar.
6) Returns `null` when `selection === null`.
7) `HomeConfirmationLoader.tsx` contract check: verify `"use client";` directive is present on line 1 (required for Server Component App Router layouts) and does not statically import `DeviceConfirmationBanner`, `syncDeviceCases`, or `device-cases.ts` (preserving the TF-41 `<= 150 KB` cold-load budget on `/`).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/features/sos/__tests__/tf81-case-bar.test.tsx`
Expected: FAIL on missing `CaseBarView` / TF-81 markup in `DeviceConfirmationBanner.tsx` & missing `"use client";` in `HomeConfirmationLoader.tsx`.

- [ ] **Step 3: Implement `HomeConfirmationLoader.tsx` and unified `DeviceConfirmationBanner.tsx`**

1. In `HomeConfirmationLoader.tsx`: add `"use client";` on line 1, keep imports strictly to `react` + dynamic `import("./DeviceConfirmationBanner")` only when `localStorage.getItem("namjaithai:confirmation-cases")` parses to a non-empty array on mount OR on `"namjaithai:device-cases"` / `"storage"` events (handles in-session SOS creation from initially empty storage!), and always remove event listeners on unmount. Never statically import helpers into `HomeConfirmationLoader.tsx`.
2. In `DeviceConfirmationBanner.tsx`:
   - Track pathname cleanly via `usePathname()` falling back to `typeof window !== "undefined" ? window.location.pathname : "/"`. Note `"use client";` + `useI18n()` safely falls back to `REPORTER_TEXT_TH` on `/` (outside `I18nProvider`) and reads English context inside `/en/**`.
   - Seed immediate UI state from `initialCaseBarEntries([...readDeviceCases(localStorage)].reverse())` so the bar paints immediately on load and offline without waiting for network.
   - Maintain a monotonic `revision` ref/counter + `cancelled` flag: run `syncDeviceCases({ storage: window.localStorage, isCancelled: () => cancelled || syncSeq !== activeSeq })` on mount, 20s interval, `"visibilitychange"`, `"online"`, `"namjaithai:device-cases"`, and `"storage"` (skipping only when `document.hidden`).
   - Extract `CaseBarView` rendering (`data-testid="my-case-bar"`, `bg-primary-50 border-border-default border-b` for tracking; `bg-amber-50 border-amber-300 border-b` when `mode === "confirm"`) inside `mx-auto max-w-6xl px-4 py-2 sm:px-6`, responsive wrap (`min-w-0`), zero `360px` overflow, `min-h-12` `"ดูสถานะ"` CTA, expandable `"อีก N เคส"` panel, dismiss button calling `dismissDeviceCase`, and `ConfirmationActions` when `mode === "confirm"`.

- [ ] **Step 4: Run unit tests to verify pass**

Run: `npx vitest run src/features/sos/__tests__/tf81-case-bar.test.tsx src/features/sos/__tests__/tf58-confirmation.test.ts`
Expected: PASS (all TF-81 unit, sync, SSR view, and TF-58 confirmation tests green).

---

### Task 4: Move Mount Points Directly Beneath `<Navbar />` Across Public & English Layouts

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/pages/_app.tsx`
- Modify: `src/pages/index.tsx`
- Modify: `src/app/(public)/layout.tsx`
- Modify: `src/app/(sos)/layout.tsx`
- Modify: `src/app/en/(info)/layout.tsx`
- Modify: `src/app/en/(form)/layout.tsx`

**Interfaces:**
- Consumes: `HomeConfirmationLoader` from `@/features/sos/components/HomeConfirmationLoader`

- [ ] **Step 1: Verify existing static layout & cold-load specs understand current baseline**

Ensure all unit tests pass before moving mounts (`npx vitest run`).

- [ ] **Step 2: Update root & public/English layouts**

1. Remove `<DeviceConfirmationBanner />` and its import from `src/app/layout.tsx`.
2. Remove `<HomeConfirmationLoader />` and its import from `src/pages/_app.tsx`.
3. Render `<HomeConfirmationLoader />` directly after `</header>` in:
   - `src/pages/index.tsx` (after `</header>`, before `<main>`)
   - `src/app/(public)/layout.tsx` (after `</header>`, before `<main>`)
   - `src/app/(sos)/layout.tsx` (after `</header>`, before `<main>`)
   - `src/app/en/(info)/layout.tsx` (after `</header>`, before `<main>`)
   - `src/app/en/(form)/layout.tsx` (after `</header>`, before `<main>`)

- [ ] **Step 3: Verify typecheck, lint, unit tests, and Next.js production build**

Run: `npm run lint ; npm run typecheck ; npm test ; npm run build`
Expected: All pass cleanly (`(public)`, `(sos)`, `/en/...`, `/` build cleanly without Cache Components dynamic-server errors, and `/api/...` routes unchanged).

---

### Task 5: TF-81 Playwright E2E Coverage, TF-41 Size Check & Full Verification Suite

**Files:**
- Create: `e2e/tf81-my-case-bar.spec.ts`
- Test existing regressions: `e2e/tf58-confirm-close.spec.ts`, `e2e/reporter-team-tracking.spec.ts`, `e2e/shared-layout.spec.ts`, `e2e/pwa.spec.ts`

**Interfaces:**
- Uses Playwright helpers: `adminDb`, `closeTestCases` (`./helpers/db`), `createAccount`, `applySession` (`./helpers/accounts`), `openFreshSosForm`, `goToStep5` (`./helpers/sos`)

- [ ] **Step 1: Write comprehensive Playwright suite in `e2e/tf81-my-case-bar.spec.ts` (desktop + mobile)**

Cover all TF-81 acceptance criteria cleanly (using isolated provinces e.g. `"สิงห์บุรี"` / `"อ่างทอง"` or distinct test phone numbers, cleaning up cases & accounts in `afterAll`, with zero dependence on unmerged PR #87):
1. **End-to-end journey (desktop + mobile 375px & 360px overflow check):**
   - **In-session loader activation from empty storage (Review Focus #3):** Load `/` with empty `localStorage` (`data-testid="my-case-bar"` absent, zero `/api/track` requests fired), then submit real SOS via `/request` -> return/navigate or stay in-session via `"namjaithai:device-cases"` and verify `data-testid="my-case-bar"` appears **below `<header>`** (`barBox.y >= headerBox.y + headerBox.height - 1`) showing `"เคสของคุณ FL-..."` and `"รอรับเคส"`, no PII (name/phone/coords absent).
   - Advance status via DB/rescuer RPC -> `"ACCEPTED"` -> `"EN_ROUTE"` -> poll/refresh shows `"ทีมกำลังมา"` -> click `"ดูสถานะ"` navigates to `/track/[code]?t=...` -> bar does NOT duplicate tracking strip on `/track/[code]` -> navigate back to `/hotlines` -> bar reappears.
   - Dismiss (`"ซ่อน"`) during `"EN_ROUTE"` -> reload `/` -> stays hidden.
   - Advance case to `"AWAITING_CONFIRMATION"` -> bar resurfaces automatically with single merged TF-58 confirmation region (`"ยืนยันการช่วยเหลือ"`); also verify `"ยังไม่ได้รับ"` transitions seamlessly back to `"รอรับเคส"`, and final `"ฉันได้รับความช่วยเหลือแล้ว"` marks `"RESOLVED"` and removes the bar cleanly from `/`!
2. **Multi-case, `/en` localization, offline fallback & staff route isolation:**
   - Multiple open cases (`2` cases) -> displays newest + `"อีก 1 เคส"`, clicking expands second case with `"ดูสถานะ"`, hiding newest shows second case cleanly; test older case reaching `"AWAITING_CONFIRMATION"` beating newer `"EN_ROUTE"`.
   - `/en/hotlines` & `/en/track/[code]`: displays English bar (`"Your case ..."` + short English status + `"View status"` linking to `/en/track/...`), zero Thai leakage, zero 360px horizontal overflow, mixed-case/encoded `/en/track/fl-...` suppresses tracking strip while still switching/keeping a second open case.
   - Offline fallback (`page.route("**/api/track/**", route => route.abort())` and `500`/`429` status check): bar still renders last known status + offline hint `(สถานะล่าสุด)` instead of disappearing or deleting `localStorage`.
   - Staff isolation: signed-in rescuer/lead/admin visiting `/rescue/map`, `/unit`, `/admin` never sees `data-testid="my-case-bar"` even when `localStorage` contains open cases.

- [ ] **Step 2: Ensure Docker/Supabase is running and run targeted + TF-41 + full verification suites**

Run:
1. `npm run db:start` / `npm run check:migrations` / `npm run db:reset` (if needed) / `npm run test:db`
2. Targeted E2E: `npx playwright test e2e/tf81-my-case-bar.spec.ts e2e/tf58-confirm-close.spec.ts e2e/reporter-team-tracking.spec.ts e2e/shared-layout.spec.ts`
3. TF-41 budget check: `npm run e2e:pwa` (check `"Initial load: ... bytes"` `<= 150000` in `e2e/pwa.spec.ts`)
4. Full E2E + production build E2E + static checks: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`, `npm run e2e:prod`
Expected: Every test passes cleanly, `/` cold load remains `<= 150,000` compressed bytes, zero horizontal overflow on 360px/375px, zero secrets in `git diff`.
