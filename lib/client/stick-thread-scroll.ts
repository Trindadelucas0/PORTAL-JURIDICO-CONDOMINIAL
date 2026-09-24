"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

const NEAR_BOTTOM_PX = 80;

function isNearBottom(el: HTMLElement) {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= NEAR_BOTTOM_PX;
}

/** Scrolls a message pane to the end on open and when the tail grows, unless the user scrolled up. */
export function useScrollThreadToEnd(
  scrollRef: RefObject<HTMLElement | null>,
  deps: { conversationKey?: string | null; lastMessageId?: string | null; messageCount: number },
) {
  const stickToBottomRef = useRef(true);
  const lastTailIdRef = useRef<string | null>(null);
  const lastConversationKeyRef = useRef<string | null | undefined>(deps.conversationKey);
  const programmaticScrollRef = useRef(false);
  const rafRef = useRef<number | null>(null);

  const pinToEnd = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight === 0) return false;
    programmaticScrollRef.current = true;
    el.scrollTop = el.scrollHeight;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const node = scrollRef.current;
      if (node && stickToBottomRef.current) {
        programmaticScrollRef.current = true;
        node.scrollTop = node.scrollHeight;
      }
      rafRef.current = requestAnimationFrame(() => {
        programmaticScrollRef.current = false;
        rafRef.current = null;
      });
    });
    return true;
  }, [scrollRef]);

  useLayoutEffect(() => {
    const keyChanged = lastConversationKeyRef.current !== deps.conversationKey;
    if (keyChanged) {
      lastConversationKeyRef.current = deps.conversationKey;
      stickToBottomRef.current = true;
      lastTailIdRef.current = null;
    }

    const el = scrollRef.current;
    if (!el || deps.messageCount === 0) return;

    const grewAtEnd = deps.lastMessageId != null && deps.lastMessageId !== lastTailIdRef.current;
    lastTailIdRef.current = deps.lastMessageId ?? null;

    if (stickToBottomRef.current || (grewAtEnd && isNearBottom(el))) {
      pinToEnd();
    }
  }, [scrollRef, deps.conversationKey, deps.lastMessageId, deps.messageCount, pinToEnd]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      if (!stickToBottomRef.current) return;
      const node = scrollRef.current;
      if (!node || node.clientHeight === 0) return;
      pinToEnd();
    });

    observer.observe(el);
    const content = el.querySelector("[data-thread-scroll-content]");
    if (content instanceof HTMLElement) observer.observe(content);
    else {
      for (const child of el.children) {
        if (child instanceof HTMLElement) observer.observe(child);
      }
    }

    return () => {
      observer.disconnect();
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollRef, deps.conversationKey, deps.messageCount, pinToEnd]);

  return {
    onScroll: () => {
      if (programmaticScrollRef.current) return;
      const el = scrollRef.current;
      if (!el) return;
      stickToBottomRef.current = isNearBottom(el);
    },
    stickToBottom: () => {
      stickToBottomRef.current = true;
    },
    releaseStick: () => {
      stickToBottomRef.current = false;
    },
  };
}
