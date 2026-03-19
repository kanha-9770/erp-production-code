export const dynamic = 'force-dynamic';
import { DatabaseRoles } from "@/lib/DatabaseRoles"
import { NextRequest, NextResponse } from "next/server"

export async function GET() {
  try {
    // Fetch employees with their permissions
    const employees = await DatabaseRoles.getEmployeesWithPermissions()

    // Fetch modules with submodules (child modules)
    const modules = await DatabaseRoles.getModulesWithSubmodules()

    return NextResponse.json({
      success: true,
      data: {
        employees,
        modules
      }
    })
    
  } catch (error: any) {
    console.error("[API] Error fetching employee permissions:", error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error?.message || "Failed to fetch employee permissions",
        details: error?.stack
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { employeeId, batchUpdates } = body
    
    if (!employeeId) {
      console.error("[API] Missing employeeId in request")
      return NextResponse.json(
        { success: false, error: "Employee ID is required" },
        { status: 400 }
      )
    }
    
    if (!batchUpdates || !Array.isArray(batchUpdates)) {
      console.error("[API] Missing or invalid batchUpdates in request")
      return NextResponse.json(
        { success: false, error: "Batch updates array is required" },
        { status: 400 }
      )
    }
    
    // Validate employee exists
    const employee = await DatabaseRoles.getUserById(employeeId)
    if (!employee) {
      console.error("[API] Employee not found:", employeeId)
      return NextResponse.json(
        { success: false, error: "Employee not found" },
        { status: 404 }
      )
    }
    
    // Convert batchUpdates to the format expected by updateUserPermissionsBatch
    const permissionUpdates = batchUpdates.map((update: any) => ({
      permissionName: `${update.moduleId}:${update.submoduleId}:${update.permissionType}`,
      value: update.value
    }))
    
    // Process batch permission updates
    await DatabaseRoles.updateUserPermissionsBatch(employeeId, permissionUpdates)

    return NextResponse.json({
      success: true,
      message: `Successfully updated ${batchUpdates.length} permissions for employee ${employeeId}`,
      data: {
        employeeId,
        updatesCount: batchUpdates.length
      }
    })
    
  } catch (error: any) {
    console.error("[API] Error in batch permission update:", error)
    
    return NextResponse.json(
      { 
        success: false, 
        error: error?.message || "Failed to update permissions",
        details: error?.stack
      },
      { status: 500 }
    )
  }
}