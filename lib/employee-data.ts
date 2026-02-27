/**
 * Utility functions to fetch and cache employee data for attendance records
 */

interface EmployeeData {
    employeeName: string
    designation: string
    department: string
    inTime: string
    outTime: string
    totalSalary: number | null
    givenSalary: number | null
    shiftType: string
}

// Cache to store fetched employee data
const employeeCache = new Map<string, EmployeeData | null>()

export async function fetchEmployeeData(userId: string): Promise<EmployeeData | null> {
    // Return cached data if available
    if (employeeCache.has(userId)) {
        return employeeCache.get(userId) || null
    }

    try {
        let response = await fetch(`/api/users/${userId}`)

        if (!response.ok) {
            response = await fetch(`/api/employee/${userId}`)
        }

        if (!response.ok) {
            console.log("[v0] Failed to fetch employee data for userId:", userId)
            employeeCache.set(userId, null)
            return null
        }

        const data = await response.json()
        console.log("[v0] Employee data fetched:", data)

        const employee = data.employee || data.data || data

        const employeeData: EmployeeData = {
            employeeName: employee.employeeName || employee.name || employee.Employee_Name || "—",
            designation: employee.designation || employee.Designation || employee.position || "—",
            department: employee.department || employee.Department || "—",
            inTime: employee.inTime || employee.In_Time || employee.shift?.inTime || "—",
            outTime: employee.outTime || employee.Out_Time || employee.shift?.outTime || "—",
            totalSalary: employee.totalSalary || employee.Total_Salary || employee.salary || null,
            givenSalary: employee.givenSalary || employee.Given_Salary || null,
            shiftType: employee.shiftType || employee.Shift_Type || "—",
        }

        employeeCache.set(userId, employeeData)
        return employeeData
    } catch (error) {
        console.error("[v0] Error fetching employee data for userId:", userId, error)
        employeeCache.set(userId, null)
        return null
    }
}

export function clearEmployeeCache() {
    employeeCache.clear()
}
