/**
 * Seed HR master dropdowns. These are the option lists shown on the HR Master
 * page and consumed by the Employee Master / Leave / Attendance forms.
 *
 * The VALUES mirror what was previously hardcoded across the HR components
 * (employee-form.tsx etc.) so nothing visibly changes on first load — but now
 * every list is editable in one place. New masters added here are backfilled
 * into existing orgs automatically (see lib/api-handlers/hr-master.ts).
 */

import type { HrMasterType } from "./types";

function opts(values: string[]): HrMasterType["options"] {
  return values.map((value, i) => ({
    id: `seed-${value.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    value,
    active: true,
    sortOrder: i,
  }));
}

export const HR_SEED_MASTERS: HrMasterType[] = [
  {
    key: "department",
    label: "Department",
    description: "Org departments used across Employee Master, payroll and reports.",
    icon: "building",
    system: true,
    options: opts([
      "Engineering",
      "Human Resources",
      "Finance & Accounts",
      "Sales",
      "Marketing",
      "Operations",
      "Production",
      "Quality",
      "Information Technology",
      "Administration",
    ]),
  },
  {
    key: "designation",
    label: "Designation",
    description: "Job titles assignable to an employee.",
    icon: "idcard",
    system: true,
    options: opts([
      "Intern",
      "Trainee Engineer",
      "Software Developer",
      "Senior Developer",
      "Team Lead",
      "HR Executive",
      "HR Manager",
      "Accountant",
      "Sales Executive",
      "Production Supervisor",
      "Quality Engineer",
      "Operations Manager",
    ]),
  },
  {
    key: "employment_type",
    label: "Employment Type",
    description: "Nature of the employment contract.",
    icon: "briefcase",
    system: true,
    options: opts(["Full-time", "Part-time", "Contract", "Intern", "Probation"]),
  },
  {
    key: "shift_type",
    label: "Shift Type",
    description: "Working-shift label shown on the employee record.",
    icon: "clock",
    system: true,
    options: opts(["General", "Morning", "Evening", "Night", "Rotational"]),
  },
  {
    key: "salary_mode",
    label: "Salary Mode",
    description: "How salary is paid out.",
    icon: "wallet",
    options: opts(["Bank Transfer", "Cash", "Cheque"]),
  },
  {
    key: "blood_group",
    label: "Blood Group",
    description: "Employee blood group (personal details).",
    icon: "droplet",
    options: opts(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]),
  },
  {
    key: "marital_status",
    label: "Marital Status",
    description: "Marital status (personal details).",
    icon: "heart",
    options: opts(["Single", "Married", "Divorced", "Widowed"]),
  },
  {
    key: "salutation",
    label: "Salutation",
    description: "Title prefix for an employee's name.",
    icon: "user",
    options: opts(["Mr.", "Mrs.", "Ms.", "Dr.", "Prof."]),
  },
  {
    key: "accommodation_type",
    label: "Accommodation Type",
    description: "Current / permanent accommodation type.",
    icon: "home",
    options: opts(["Owned", "Rented", "Company-provided", "Family"]),
  },
];
