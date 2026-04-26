/**
 * Scrolls a post element with the given id into a comfortable view position.
 * Returns true when the post element was found and considered (whether or not it
 * actually scrolled), false when the post is not yet rendered in the DOM.
 */
export function scrollToPostId(postId: string): boolean {
  const post = Array.from(document.querySelectorAll<HTMLElement>("[data-post-id]")).find(
    (element) => element.dataset.postId === postId,
  );
  if (!post) return false;

  const rect = post.getBoundingClientRect();
  const isComfortablyVisible = rect.top >= 96 && rect.top <= window.innerHeight * 0.7;
  if (!isComfortablyVisible) {
    post.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return true;
}
