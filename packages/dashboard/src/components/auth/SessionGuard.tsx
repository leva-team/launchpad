"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function SessionGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (pathname === "/login") return;

    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const res = await originalFetch(...args);
      if (res.status === 401) {
        window.location.href = `/login?redirect=${encodeURIComponent(pathname)}`;
      }
      return res;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [pathname]);

  return null;
}
