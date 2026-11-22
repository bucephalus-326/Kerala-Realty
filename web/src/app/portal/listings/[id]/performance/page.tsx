import { Performance } from "@/components/portal/performance";

export default async function PerformancePage({ params }: { params: Promise<{ id: string }> }) {
  return <Performance id={(await params).id} />;
}
