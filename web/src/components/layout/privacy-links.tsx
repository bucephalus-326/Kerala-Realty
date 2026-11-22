"use client";

import Link from "next/link";
import { usePrefs } from "../providers";

export function PrivacyLinks() {
  const { reopenConsent } = usePrefs();
  return (
    <p className="flex items-center gap-3">
      <Link href="/privacy" className="hover:text-ink">
        Privacy notice
      </Link>
      <button onClick={reopenConsent} className="hover:text-ink">
        Privacy choices
      </button>
    </p>
  );
}
