"use client";

import type { FormState } from "@/lib/admin/validation";
import { ui } from "@/components/ui";
import { EmployeeEditor } from "./employee-editor";
import { ModalButton } from "./modal-button";

/** "+ Add employee" button that opens the employee form in a pop-up. */
export function AddEmployeeModal({
  action,
  managedCafes,
  defaultCafeId,
  cafeName,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  managedCafes: { id: string; name: string }[];
  defaultCafeId: string;
  cafeName: string;
}) {
  return (
    <ModalButton label="+ Add employee" title="Add employee" subtitle={cafeName} buttonClassName={ui.primary}>
      {(close) => (
        <EmployeeEditor
          action={action}
          managedCafes={managedCafes}
          defaultCafeId={defaultCafeId}
          submitLabel="Add employee"
          onSaved={close}
        />
      )}
    </ModalButton>
  );
}
