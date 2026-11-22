import { Suspense } from "react";
import { ListingEditor } from "@/components/portal/listing-editor";

export default function NewListingPage() {
  return (
    <Suspense>
      <ListingEditor />
    </Suspense>
  );
}
