import { NextResponse } from "next/server"
import { DatabaseService } from "@/lib/database-service"

export async function POST() {
  try {
    await DatabaseService.seedFieldTypes()
    return NextResponse.json({ success: true, message: "Database initialized successfully" })
  } catch (error: any) {
    console.error("Error initializing database:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
