"use client";

import { Briefcase } from "lucide-react";
import { EntityListManager } from "../entity-list-manager";

export function DesignationsSection() {
  return (
    <EntityListManager
      section="designations"
      title="Designations"
      description="Job titles and designation levels used across the organization."
      itemNoun="designation"
      primaryKey="title"
      icon={Briefcase}
      fields={[
        { key: "title", label: "Designation Name", required: true, inTable: true, placeholder: "Senior Engineer" },
        { key: "code", label: "Code", inTable: true, badge: true, placeholder: "SE" },
        {
          key: "associatedUsers",
          label: "Associated users",
          inTable: true,
          compute: () => <span className="tabular-nums">0</span>,
        },
        {
          key: "parentDesignation",
          label: "Parent Designation",
          optionsFromItems: true,
          inTable: true,
          placeholder: "None",
        },
        { key: "level", label: "Level", type: "number", inTable: true, placeholder: "3" },
        { key: "description", label: "Description", type: "textarea", placeholder: "Scope and responsibilities" },
      ]}
    />
  );
}
