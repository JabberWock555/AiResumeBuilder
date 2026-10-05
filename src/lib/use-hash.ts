"use client";

import { useSyncExternalStore } from "react";

const subscribe = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** The URL hash without "#". Empty during server rendering, so hydration matches. */
export function useHash() {
  return useSyncExternalStore(subscribe, () => decodeURIComponent(window.location.hash.slice(1)), () => "");
}
