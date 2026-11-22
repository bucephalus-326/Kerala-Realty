import { Suspense } from "react";
import { PortalHome } from "@/components/portal/portal-home";

export default function PortalPage() {
  return (
    <Suspense>
      <PortalHome />
    </Suspense>
  );
}
