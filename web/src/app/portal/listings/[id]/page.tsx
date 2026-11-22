import { Suspense } from "react";
import { ListingEditor } from "@/components/portal/listing-editor";

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ListingEditor id={id} />
    </Suspense>
  );
}
