// tokens/page.tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function TokensPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/market/base");
  }, [router]);

  return null;
}