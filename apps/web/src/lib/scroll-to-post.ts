export type ScrollToPostResult = { found: false } | { found: true; scrolled: boolean };

/**
 * Scrolls a post element with the given id into a comfortable view position.
 * Returns `{ found: false }` when the post element is not yet rendered, and
 * `{ found: true, scrolled }` otherwise — `scrolled` is true only if the post
 * was off-screen and required a scroll, false if already comfortably visible.
 * The caller uses `scrolled` to gate analytics so already-visible jumps don't
 * count as "jump performed" events.
 */
export function scrollToPostId(postId: string): ScrollToPostResult {
  const post = Array.from(document.querySelectorAll<HTMLElement>("[data-post-id]")).find(
    (element) => element.dataset.postId === postId,
  );
  if (!post) return { found: false };

  const rect = post.getBoundingClientRect();
  const isComfortablyVisible = rect.top >= 96 && rect.top <= window.innerHeight * 0.7;
  if (isComfortablyVisible) return { found: true, scrolled: false };

  post.scrollIntoView({ behavior: "smooth", block: "start" });
  return { found: true, scrolled: true };
}
