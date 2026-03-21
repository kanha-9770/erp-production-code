export const dynamic = 'force-dynamic';
import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database/database-service"

export async function GET() {
  try {
    const fieldTypes = await DatabaseService.getFieldTypes()
    return NextResponse.json({ success: true, data: fieldTypes })
  } catch (error: any) {
    console.error("Error fetching field types:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST() {
  // This route is typically for seeding or admin purposes, not general API use
  // For now, we'll just return a success message if called.
  try {
    const fieldTypesData = [
      {
        name: "text",
        label: "Text Input",
        category: "basic",
        icon: "Type",
        description: "Single line text input",
        defaultProps: {},
      },
      {
        name: "textarea",
        label: "Text Area",
        category: "basic",
        icon: "AlignLeft",
        description: "Multi-line text input",
        defaultProps: { rows: 3 },
      },
      {
        name: "number",
        label: "Number",
        category: "basic",
        icon: "Hash",
        description: "Numeric input field",
        defaultProps: {},
      },
      {
        name: "email",
        label: "Email",
        category: "basic",
        icon: "Mail",
        description: "Email address input",
        defaultProps: { validation: { email: true } },
      },
      {
        name: "phone",
        label: "Phone",
        category: "basic",
        icon: "Phone",
        description: "Phone number input",
        defaultProps: { validation: { phone: true } },
      },
      {
        name: "date",
        label: "Date",
        category: "basic",
        icon: "Calendar",
        description: "Date picker field",
        defaultProps: {},
      },
      {
        name: "checkbox",
        label: "Checkbox",
        category: "choice",
        icon: "CheckSquare",
        description: "Single checkbox",
        defaultProps: {},
      },
      {
        name: "radio",
        label: "Radio Buttons",
        category: "choice",
        icon: "Radio",
        description: "Multiple choice (single select)",
        defaultProps: { options: [{ id: "opt1", label: "Option 1", value: "option1" }] },
      },
      {
        name: "select",
        label: "Dropdown",
        category: "choice",
        icon: "ChevronDown",
        description: "Dropdown select list",
        defaultProps: { options: [{ id: "opt1", label: "Option 1", value: "option1" }] },
      },
      {
        name: "file",
        label: "File Upload",
        category: "advanced",
        icon: "Upload",
        description: "File upload field",
        defaultProps: { multiple: false },
      },
      {
        name: "lookup",
        label: "Lookup",
        category: "advanced",
        icon: "Search",
        description: "Reference data from other sources",
        defaultProps: {},
      },
      {
        name: "formula",
        label: "Formula",
        category: "advanced",
        icon: "Calculator",
        description: "Calculated field based on other inputs",
        defaultProps: {},
      },
      {
        name: "rollup",
        label: "Rollup",
        category: "advanced",
        icon: "Database",
        description: "Aggregated value from related records",
        defaultProps: {},
      },
    ]

    for (const typeData of fieldTypesData) {
      await DatabaseService.upsertFieldType({
        name: typeData.name,
        label: typeData.label,
        category: typeData.category,
        icon: typeData.icon,
        description: typeData.description,
        defaultProps: typeData.defaultProps,
        active: true,
      })
    }

    return NextResponse.json({ success: true, message: "Field types seeded successfully." })
  } catch (error: any) {
    console.error("Error seeding field types:", error)
    return NextResponse.json({ success: false, error: error.message, message: error.message }, { status: 500 })
  }
}
