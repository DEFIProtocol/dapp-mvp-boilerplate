// app/crypto/page.tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CryptoPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/futures");
  }, [router]);

  return null;
}