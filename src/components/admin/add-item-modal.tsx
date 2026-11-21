"use client";

import type { FormState } from "@/lib/admin/validation";
import { ItemEditor } from "./item-editor";
import { ModalButton } from "./modal-button";

/** "+ Add item" button that opens the item editor in a pop-up. */
export function AddItemModal({
  action,
  units,
  today,
  sectionName,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  units: string[];
  today: string;
  sectionName: string;
}) {
  return (
    <ModalButton label="+ Add item" title="Add item" subtitle={sectionName}>
      {(close) => <ItemEditor action={action} units={units} today={today} submitLabel="Save item" onSaved={close} />}
    </ModalButton>
  );
}
