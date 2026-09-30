"use client";

import { useSearchParams } from "next/navigation";

export function AccountDeletedNotice() {
  const params = useSearchParams();
  if (params.get("account_deleted") !== "1") return null;
  return (
    <div role="status" className="border-b bg-success-soft px-5 py-3 text-center text-sm text-success">
      Your account and all of its data have been permanently deleted.
    </div>
  );
}
