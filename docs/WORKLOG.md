# Work Log — Improvements & Fixes

A running log of the correctness fixes, performance work, and API changes made to
`@mikrostack/vir`, a React virtualized-list library, plus the items still
outstanding. Completed work is recorded in section 3; the live backlog is
section 4. Newest work is appended.

- **Origin:** a performance and correctness review in June 2026 against `main`
  at `6a3f045` (sections 1–2 capture that initial pass).
- **Merged so far:** PR #5 (fixes, performance, tests, CI), #6 (docs), and #8
  (packaging, rendering, visibility API, playground, `scrollToItem`).

---

## 1. Architecture

The library splits responsibilities across a plain-TypeScript core driven by a
React binding layer:

- **`DataProvider`** — owns raw items, applies an optional selector, exposes
  ordered ids and id→item lookups, and tracks loading/refetching/error state.
- **`Measurements`** — owns per-item heights and top offsets, the total height,
  and the maximize/collapse state.
- **`ScrollContainer`** — owns the scroll element, container height, scroll
  position, and the resize/scroll listeners.
- **`VirtualizedListManager`** — composes the three, computes the snapshot
  (`visibleItems` + viewport info) consumed by React via an external store.
- **React layer** — `useDataProvider`, `useVirtualizedList`
  (`useSyncExternalStore`), and the `VirtualizedList` / `VirtualizedItem`
  components.

The external-store design is sound. The problems were in the implementation:
several stacked `O(n)`-per-scroll paths, a state-mutation pattern that defeated
its own memoization, and a handful of outright correctness bugs.

---

## 2. Initial findings

### Correctness bugs

1. **`ScrollContainer.init` clobbered inline styles.** Assigning a string to
   `element.style` replaces the entire `cssText`, wiping the `height: 100%`
   React applied to the internal scroll container (and any consumer styles on an
   external one). Without a constrained height the container grew to fit content
   and virtualization silently degraded toward rendering everything.

2. **`DataProvider.updateRawData` missed data changes.** Change detection
   compared only length + first/last id, so an edit, replacement, or reorder in
   the middle of the list was dropped entirely — `rawItems` was never stored and
   the selector never reapplied. Changes to `isRefetching` alone were also
   ignored.

3. **Mutable measurements leaked into React snapshots.** `buildMeasurements`
   mutated `measurement.top` in place on the same objects embedded in the cached
   snapshot, so the deep-equality check compared an object against itself and
   reported "no change" even when positions shifted. The `version`/`lastUsed`
   fields caused the opposite problem — spurious inequality on every rebuild.

4. **Maximize toggle corrupted heights.** `toggleMaximize` applied the maximized
   height unconditionally, so collapsing re-inflated the item until the
   ResizeObserver corrected it; in `natural` mode it wrote a `0` height,
   transiently collapsing the item and corrupting the total.

5. **Scroll binding lost on effect re-runs / StrictMode.** The initialize
   effect's cleanup tore down the scroll container and cleared *all* subscribers,
   but nothing re-attached the container when the effect re-ran (React ref
   callbacks only fire on mount). The external-ref effect also depended on
   `scrollContainerRef.current`, which a dependency array cannot observe.

6. **Inline selectors/normalizers churned every render.** The selector memo
   included the selector's identity, defeating the `dependencies` array: an
   inline selector reapplied (O(n) select + full measurement rebuild) on every
   render. Spreading user `dependencies` into a hook dep array also violated the
   Rules of Hooks. An inline `normalizeData` re-normalized the whole dataset per
   render.

7. **Stale API surface.** `useVirtualizedList` was not exported; the
   `VirtualizedListInterface.measureItem` signature carried a phantom `index`
   parameter; `@tanstack/react-query` was a peer dependency despite never being
   imported; README examples used a per-item normalizer where the type takes the
   whole array.

8. **Smaller issues.** Internal scroll events were processed twice (React
   `onScroll` + the imperative listener); `isEqual` had no cycle protection
   (stack overflow on circular content).

### Performance

On every scroll event the chain was: `handleScroll` → `getTotalHeight()` (O(n))
→ notify → `getSnapshot` → `getOrderedIds()` (O(n) allocation, called several
times) → `getVisibleItems` full linear scan (O(n)) with an `Array.find` per
visible item (O(n)) → fresh state object → recursive deep `isEqual` over the
whole snapshot including user content. For a 10k-item list this was several
full-list traversals plus a deep compare per scroll frame.

---

## 3. Work completed (merged)

### Correctness fixes — PR #5

| Commit | Fix |
|--------|-----|
| `804ef85` | Set scroll-element styles individually instead of replacing `cssText` |
| `7d21371` | Pairwise change detection (id + content ref); track `isRefetching` |
| `f08c2aa` | Snapshots carry an immutable `ItemPosition` copy, not the live measurement |
| `914a054` | Track and restore pre-maximize height; skip the `0`-height write in natural mode |
| `ca55846` | Remember and re-attach the scroll element on re-init; don't clear owned subscriptions |
| `f354f1f` | `dependencies` is the selector cache key, compared by value outside any hook deps |
| `bf08a37` | Export `useVirtualizedList`; fix interface signature; drop react-query peer dep; fix README |
| `0db3122` | Remove the duplicate React `onScroll` handler on the internal container |

### Performance — PR #5

| Commit | Change |
|--------|--------|
| `78e4944` | `DataProvider` id→item Map, cached ordered-ids array, stable placeholder identities |
| `4274eba` | Cache total height from `buildMeasurements`; binary-search the visible window (O(log n + visible)); coalesce measurement frame callbacks |
| `c02e410` | Cache the snapshot and reuse per-item wrappers by identity; delete the recursive `isEqual` |

Net effect: a scroll event went from multiple full-list traversals plus a deep
compare to one binary search plus a handful of reference checks.

### Infrastructure — PR #5

- `fb5b0ff` — Vitest + Testing Library suite, 35 tests across 5 files, including
  a regression test for each bug above. Setup stubs `ResizeObserver`, a
  deterministic `requestAnimationFrame`, and `Element.scrollTo` for jsdom.
- `e175a99` — CI workflow (typecheck + test + build on PRs and `main` pushes).
- `ec8a32a` — Bumped both workflows to Node 24 (Node 20 reached EOL April 2026).

### Documentation — PR #6

- Removed the React Query references (the peer dependency is gone); reframed the
  data-source section as bring-your-own.
- Documented the now-exported `useVirtualizedList` hook and corrected the
  custom-maximized-height example to use it.
- Fixed a non-existent `content.position` field reference and the
  `VirtualizedItemProps` default type parameter.

### Packaging, rendering, visibility & API — PR #8

Picking up the lower-risk items from section 4, plus an API reshape:

- **Packaging.** Added a conditional `exports` map (types-first per condition),
  `"sideEffects": false`, and `engines.node` `">=20"`; configured tsup to drop
  the debug `console.info` logs from the bundle via esbuild `pure`. The
  `console.error` diagnostics are kept on purpose — they report subscriber and
  selector failures to consumers.
- **`transform: translateY()` positioning.** Measured items position with a
  compositor transform and `top: 0` instead of `top`, so scroll re-positioning
  no longer invalidates layout. Dropped `will-change: scroll-position` from both
  the internal and external scrollers.
- **`borderBoxSize` measurement.** The item `ResizeObserver` now observes the
  border box and reads `borderBoxSize.blockSize` (falling back to
  `contentRect.height`), so a padded item wrapper measures the space it actually
  occupies.
- **Visibility contract.** The manager now distinguishes the *true* viewport
  (expanded by a configurable `visibilityMargin`, default 200px) from the larger
  overscan render window. It exposes this two ways: an `isVisible` flag on each
  item (for in-item concerns like pausing off-screen video) and a
  `config.onVisibleChange(change)` callback reporting `visibleIds` plus
  enter/exit transitions, coalesced to scroll frames. This lets consumers
  coordinate data fetching *outside* the item components — and, by caching in
  that coordinator, makes re-entry a no-op instead of a re-fetch. The library
  reports visibility only; it does not cache. Added groundwork for DOM recycling
  (see section 4): once nodes are pooled rather than remounted, an explicit
  visibility signal is what keeps mount-driven side effects correct.
- **Removed maximization; added `scrollToItem`.** The library no longer owns a
  maximize concept (the single-item state, the four height modes, the
  `restoreHeight`/clip machinery, `isMaximized`/`onToggleMaximize` props). Since
  items already measure their own height, "expanded" is just an item that renders
  taller — the consumer owns that state and the list remeasures automatically,
  matching the same policy-in-the-consumer philosophy as the visibility contract.
  The one genuinely list-internal capability, scroll-into-view, is exposed as an
  imperative `scrollToItem(id)` (and `scrollToTop`) via an `apiRef` prop.
- **Initialize builds from current provider data.** A manager mounting against an
  already-populated provider (e.g. a remounted list) now builds measurements in
  `initialize()` rather than waiting for the next data notification, which would
  otherwise leave it rendering empty.

Regression tests track each change (translateY positioning; border-box height
winning over `contentRect`; `isVisible` viewport-vs-overscan; visibility
enter/exit transitions and no-op-scroll silence; `scrollToItem` reveal and
already-visible no-op), and the maximize tests were removed — 39 in total.

### Bug sweep & this log's rename — branch `bug-sweep-and-doc`

A final adversarial review (two independent passes over the core and the React
layer). Most paths held up; the fixes:

- **`getViewportInfo` dropped the gap term** before initialization, so the spacer
  height jumped once the scroll container attached (only observable with
  `gap > 0`). It now delegates to the gap-aware `getTotalHeight` in every state.
- **Resize/scroll race on `scrollTopRatio`.** The proportional scroll-restore
  after a container resize read `this.scrollTopRatio` in a deferred rAF, which a
  concurrent scroll could clobber; the ratio is now captured in a local.
- **Unbuilt-fallback scans** in `getVisibleItems` / `computeVisibleIds` kept the
  monotonic early-`break`, and `scrollToItem`'s default-height estimate ignored
  `gap`. Both are defensive paths *not* reachable under current invariants
  (`buildMeasurements` always populates every id at the current version), but are
  now correct should those invariants change.
- **ResizeObserver hygiene.** The item observer is no longer nulled in its effect
  cleanup, avoiding a transient second observer across a StrictMode remount.

A regression test covers the gap-in-`totalHeight` fix — 40 in total. This file
was also renamed from `ANALYSIS.md` to reflect its function as a running log.

Separately, PR #9 lifted the playground video example's `playing` flag into its
coordinator so it survives an item scrolling off-screen and back — modelling
that per-item state belongs outside the (unmounted-while-off-screen) item.

---

## 4. Outstanding work

None of the below is required for correctness; they are further performance
improvements, roughly in descending order of value.

### Rendering / measurement

- **DOM node recycling.** Items are unmounted/remounted as they scroll in and
  out. Keying by slot index (a pool of ~visible+overscan nodes) turns scroll into
  pure prop updates with no mount/unmount cost — the biggest win for heavy item
  components. The visibility contract added on this branch is the prerequisite:
  once nodes are pooled, mount/unmount no longer signals enter/exit, so item
  side effects must key off `isVisible` / `onVisibleChange` instead.
- **Structure-of-arrays measurements.** Replace the `Map<string, {...}>` with
  parallel typed arrays plus an id→index map; tops become a prefix-sum array
  (cache-friendly binary search, zero per-item allocation). A Fenwick tree over
  heights makes height-update and offset-lookup `O(log n)`, removing full
  rebuilds entirely. Revisit only if `buildMeasurements` shows up in a profile.
- **Decouple scroll from React.** Update `transform` directly on existing DOM
  nodes during scroll (rAF-driven), involving React only when the *set* of
  visible ids changes.
- **Browser height-limit guard.** Browsers cap element heights near ~33.5M px
  (~335k items at 100px). A scale factor between virtual and rendered offsets
  future-proofs very large lists.

### Data layer

- **Async selector support.** Let `selector` return a `Promise`, so heavy
  sort/filter/group work can run in a Web Worker. Needs a version stamp to
  discard stale late-arriving results and a "selecting" state to keep showing
  previous data. This is the only place a Web Worker genuinely helps — the
  per-scroll math is already sub-microsecond, and the DOM/React render cost a
  worker cannot touch is where a list's frame budget actually goes.

---

## 5. Verification

All work is verified locally (`tsc --noEmit`, `npm run build`, `npm test` — 40
passing) and through CI before merge. Library changes are also smoke-tested in
the playground (`npm run playground`). Note: the test runner currently requires
Node 22+ locally (a transitive dep is ESM-only and the rolldown native binding
hits the npm optional-deps bug on older Node); the build and the playground run
on Node 20. CI runs Node 24.
