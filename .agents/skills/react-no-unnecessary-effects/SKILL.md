---
name: react-no-unnecessary-effects
description: "MUST trigger every time you are about to write, add, or modify a useEffect in any React component. Before writing any useEffect, consult this skill to verify the effect is truly necessary. Also triggers when reviewing or refactoring components that use useEffect, when synchronizing state with props, when deriving state, or when handling user events. If the effect can be replaced with a calculation during render, useMemo, an event handler, or a key prop — do that instead."
---

# You Might Not Need an Effect

Based on [react.dev/learn/you-might-not-need-an-effect](https://react.dev/learn/you-might-not-need-an-effect).

Effects are for synchronizing with **external systems** (DOM APIs, network, third-party widgets). If you're only transforming data or responding to user events, you don't need an Effect.

**Component structure rule:** When a component accumulates significant logic (multiple hooks, effects, handlers), extract reusable logic into custom hooks in `hooks/` and shared UI into dedicated component files. Keep page components thin — they should compose hooks and components, not contain raw logic.

## When to Apply

Review for unnecessary Effects whenever you see:

- `useEffect` + `setState` that derives from props/state
- `useEffect` that responds to user interactions
- `useEffect` chains (one effect triggers state that triggers another)
- `useCallback` used only as an Effect dependency
- `useEffect` that re-subscribes to external APIs on every render due to unstable dependencies

## Rules

### Rule 1: Don't derive state with Effects

```tsx
// BAD - extra render pass, stale flash
const [fullName, setFullName] = useState("");
useEffect(() => {
  setFullName(firstName + " " + lastName);
}, [firstName, lastName]);

// GOOD - calculate during render
const fullName = firstName + " " + lastName;
```

If expensive, use `useMemo`:

```tsx
const visibleTodos = useMemo(() => filterTodos(todos, filter), [todos, filter]);
```

### Rule 2: Don't handle user events in Effects

```tsx
// BAD - fires on page reload too
useEffect(() => {
  if (product.isInCart) showNotification("Added!");
}, [product]);

// GOOD - explicit causality
function handleBuyClick() {
  addToCart(product);
  showNotification("Added!");
}
```

**Key question:** Did this code run _because the user did something_? Put it in an event handler. Did it run _because the component appeared on screen_? Put it in an Effect.

### Rule 3: Don't reset state with Effects — use keys

```tsx
// BAD
useEffect(() => {
  setComment("");
}, [userId]);

// GOOD
<Profile userId={userId} key={userId} />;
```

### Rule 4: Don't chain Effects

```tsx
// BAD - multiple render passes, fragile
useEffect(() => {
  if (card?.gold) setGoldCount((c) => c + 1);
}, [card]);
useEffect(() => {
  if (goldCount > 3) setRound((r) => r + 1);
}, [goldCount]);

// GOOD - calculate in the event handler
function handlePlaceCard(nextCard) {
  setCard(nextCard);
  if (nextCard.gold) {
    if (goldCount < 3) setGoldCount(goldCount + 1);
    else {
      setGoldCount(0);
      setRound(round + 1);
    }
  }
}
```

### Rule 5: Don't notify parents via Effects

```tsx
// BAD
useEffect(() => {
  onChange(isOn);
}, [isOn, onChange]);

// GOOD
function handleClick() {
  const next = !isOn;
  setIsOn(next);
  onChange(next);
}
```

### Rule 6: Don't make POST requests in Effects for user actions

```tsx
// BAD
useEffect(() => {
  if (json) post("/api/register", json);
}, [json]);

// GOOD
function handleSubmit() {
  post("/api/register", { firstName, lastName });
}
```

### Rule 7: Stabilize external system subscriptions

When you _do_ need an Effect for external systems (IntersectionObserver, WebSocket, etc.), avoid recreating subscriptions on every render:

```tsx
// BAD - observer recreated every time status changes
const handleLoadMore = useCallback(() => {
  if (status === "CanLoadMore") loadMore(10);
}, [status, loadMore]);

useEffect(() => {
  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting) handleLoadMore();
  });
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [handleLoadMore]); // <-- tears down and recreates on every status change!

// GOOD - stable observer, read latest values via ref
const loadMoreRef = useRef(loadMore);
const statusRef = useRef(status);
useEffect(() => {
  loadMoreRef.current = loadMore;
}, [loadMore]);
useEffect(() => {
  statusRef.current = status;
}, [status]);

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel) return;
  const observer = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && statusRef.current === "CanLoadMore") {
      loadMoreRef.current(10);
    }
  });
  observer.observe(sentinel);
  return () => observer.disconnect();
}, []); // <-- stable! observer created once
```

### Rule 8: Guard initialization Effects properly

For one-time initialization (analytics, auto-fetch on mount), use a module-level flag or ref:

```tsx
// GOOD
const didInit = useRef(false);
useEffect(() => {
  if (didInit.current) return;
  didInit.current = true;
  // one-time initialization
}, []);
```

## Legitimate Effect Uses

Effects ARE appropriate for:

- Subscribing to external systems (IntersectionObserver, WebSocket, window events)
- Synchronizing with non-React state (DOM manipulation, third-party widgets)
- Fetching data on component mount (with cleanup for race conditions)
- Analytics/logging that fires when a component is displayed
- Setting up and tearing down timers

## Checklist

When reviewing any `useEffect`:

1. Is it deriving state from props/state? -> Calculate during render or useMemo
2. Is it responding to a user event? -> Move to event handler
3. Is it resetting state when a prop changes? -> Use key prop
4. Is it chained with other effects? -> Consolidate into event handler
5. Is it notifying a parent? -> Call parent callback in event handler
6. Is it subscribing to an external system? -> Ensure stable dependencies to avoid re-subscribing
7. Is it a one-time initialization? -> Guard with ref or module-level flag
