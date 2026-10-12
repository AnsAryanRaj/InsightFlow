"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, FilterState } from "./api";

/** Fetches JSON and refetches when `path` changes. `reload()` forces a refresh. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(!!path);
  const [tick, setTick] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (!path) return;
    const id = ++latest.current;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (id === latest.current) {
          setData(d);
          setError(null);
        }
      })
      .catch((e: Error) => id === latest.current && setError(e.message))
      .finally(() => id === latest.current && setLoading(false));
  }, [path, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

const FILTER_KEYS: (keyof FilterState)[] = ["category", "sentiment", "topic", "q", "date_from", "date_to"];

/** Filters live in the URL, so a filtered view can be shared or bookmarked. */
export function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const filters = useMemo(() => {
    const f: FilterState = {};
    for (const k of FILTER_KEYS) {
      const v = params.get(k);
      if (v) f[k] = v;
    }
    return f;
  }, [params]);

  const setFilters = useCallback(
    (patch: Partial<FilterState>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      next.delete("page");
      const s = next.toString();
      router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [router, pathname]);
  const active = Object.keys(filters).length;
  return { filters, setFilters, clear, active };
}
