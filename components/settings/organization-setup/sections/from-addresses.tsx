"use client";

import { Send } from "lucide-react";
import { EntityListManager } from "../entity-list-manager";

export function FromAddressesSection() {
  return (
    <EntityListManager
      section="fromAddresses"
      title="From Addresses"
      description="Sender addresses used for outgoing system email."
      itemNoun="address"
      primaryKey="email"
      icon={Send}
      enforceSingleTrue="isDefault"
      fields={[
        { key: "name", label: "Display name", required: true, inTable: true, placeholder: "Acme HR" },
        { key: "email", label: "Email address", type: "email", required: true, inTable: true, placeholder: "hr@acme.com" },
        { key: "isDefault", label: "Default sender", type: "switch", inTable: true },
      ]}
    />
  );
}
