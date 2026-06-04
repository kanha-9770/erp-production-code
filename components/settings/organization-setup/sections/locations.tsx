"use client";

import { MapPin } from "lucide-react";
import { EntityListManager } from "../entity-list-manager";
import { COUNTRIES, COMMON_TIMEZONES } from "../constants";

export function LocationsSection() {
  return (
    <EntityListManager
      section="locations"
      title="Locations"
      description="Physical offices and sites — addresses and timezones."
      itemNoun="location"
      primaryKey="name"
      icon={MapPin}
      fields={[
        { key: "name", label: "Location name", required: true, inTable: true, placeholder: "Head Office" },
        { key: "code", label: "Code", inTable: true, badge: true, placeholder: "HO" },
        { key: "addressLine1", label: "Address line 1", span2: true },
        { key: "addressLine2", label: "Address line 2", span2: true },
        { key: "city", label: "City", inTable: true },
        { key: "state", label: "State / Province" },
        { key: "country", label: "Country", type: "select", options: COUNTRIES, inTable: true },
        { key: "zip", label: "ZIP / PIN code" },
        { key: "timezone", label: "Timezone", type: "select", options: COMMON_TIMEZONES, inTable: true },
        { key: "phone", label: "Phone" },
      ]}
    />
  );
}
