import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function GET(request: Request, { params }: { params: { formId: string } }) {
  try {
    const { searchParams } = new URL(request.url)
    const range = searchParams.get("range") || "7d"

    // Get basic analytics
    const analytics = await DatabaseService.getFormAnalytics(params.formId)

    // Generate mock daily stats based on range
    const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365
    const dailyStats = Array.from({ length: days }, (_, i) => {
      const date = new Date()
      date.setDate(date.getDate() - (days - 1 - i))
      return {
        date: date.toISOString().split("T")[0],
        views: Math.floor(Math.random() * 50) + 10,
        submissions: Math.floor(Math.random() * 20) + 2,
      }
    })

    // Generate mock field stats
    const form = await DatabaseService.getForm(params.formId)
    const fieldStats =
      form?.sections.flatMap((section: { fields: any[] }) =>
        section.fields.map((field: { label: any }) => ({
          fieldName: field.label,
          completionRate: Math.round(Math.random() * 40 + 60),
          averageTime: Math.round(Math.random() * 30 + 10),
        })),
      ) || []

    // Generate mock device and location stats
    const deviceStats = [
      { device: "Desktop", count: 65, percentage: 65 },
      { device: "Mobile", count: 30, percentage: 30 },
      { device: "Tablet", count: 5, percentage: 5 },
    ]

    const locationStats = [
      { location: "United States", count: 45, percentage: 45 },
      { location: "United Kingdom", count: 20, percentage: 20 },
      { location: "Canada", count: 15, percentage: 15 },
      { location: "Australia", count: 12, percentage: 12 },
      { location: "Germany", count: 8, percentage: 8 },
    ]

    const enhancedAnalytics = {
      ...analytics,
      dailyStats,
      fieldStats,
      deviceStats,
      locationStats,
    }

    return NextResponse.json({ success: true, data: enhancedAnalytics })
  } catch (error: any) {
    console.error("Error fetching form analytics:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
