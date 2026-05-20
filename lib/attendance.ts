export interface AttendanceRecord {
  id: string;
  userId: string;
  date: string;
  checkedIn: boolean;
  checkedOut: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  ipAddress?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceStatus {
  checkedIn: boolean;
  checkedOut: boolean;
  canCheckIn: boolean;
  canCheckOut: boolean;
  checkInTime?: string;
  checkOutTime?: string;
  todayRecord?: AttendanceRecord;
}

// Get today's date in YYYY-MM-DD format.
// Uses server-local components (not UTC) so this stays aligned with
// `todayKey()` in lib/hr/attendance-service.ts — both helpers index the
// same Attendance.date column and must agree, otherwise the legacy and
// new punch endpoints write/read different rows between 00:00 UTC and
// the server's local-midnight rollover.
export const getToday = (now: Date = new Date()): string => {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Get current time in HH:mm (24-hour) format.
// Matches `formatHHmm()` in lib/hr/attendance-service.ts so the legacy
// endpoint and the new punch endpoint produce the same shape of string
// in Attendance.checkInTime / checkOutTime.
const getCurrentTime = (now: Date = new Date()): string => {
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};

// Fetch all attendance records for a user
export const getAllAttendance = async (userId: string): Promise<AttendanceRecord[]> => {
  try {
    const response = await fetch(`/api/attendance?userId=${userId}`);
    const data = await response.json();

    if (data.success) {
      return data.records || [];
    }
    throw new Error(data.error || "Failed to fetch attendance records");
  } catch (error: any) {
    console.error("[Attendance] Error fetching records:", error);
    return [];
  }
};

// Fetch attendance records for a date range
export const getAttendanceByDateRange = async (
  userId: string,
  startDate: string,
  endDate: string
): Promise<AttendanceRecord[]> => {
  try {
    const response = await fetch(
      `/api/attendance?userId=${userId}&startDate=${startDate}&endDate=${endDate}`
    );
    const data = await response.json();

    if (data.success) {
      return data.records || [];
    }
    throw new Error(data.error || "Failed to fetch attendance records");
  } catch (error: any) {
    console.error("[Attendance] Error fetching records by date range:", error);
    return [];
  }
};

// Get today's attendance record
export const getTodayRecord = async (userId: string): Promise<AttendanceRecord | null> => {
  try {
    const today = getToday();
    const response = await fetch(`/api/attendance?userId=${userId}&date=${today}`);
    const data = await response.json();

    if (data.success && data.records.length > 0) {
      return data.records[0];
    }
    return null;
  } catch (error: any) {
    console.error("[Attendance] Error fetching today's record:", error);
    return null;
  }
};

// Get attendance status (includes today's record and active status)
export const getAttendanceStatus = async (userId: string): Promise<AttendanceStatus | null> => {
  try {
    const response = await fetch(`/api/attendance/status?userId=${userId}`);
    const data = await response.json();

    if (data.success) {
      return data.status;
    }
    throw new Error(data.error || "Failed to fetch attendance status");
  } catch (error: any) {
    console.error("[Attendance] Error fetching status:", error);
    return null;
  }
};

// Check if user can check in
export const canCheckIn = async (userId: string): Promise<boolean> => {
  const status = await getAttendanceStatus(userId);
  return status?.canCheckIn || false;
};

// Check if user can check out
export const canCheckOut = async (userId: string): Promise<boolean> => {
  const status = await getAttendanceStatus(userId);
  return status?.canCheckOut || false;
};

// Record check-in
export const recordCheckIn = async (userId: string): Promise<boolean> => {
  try {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        action: "checkin",
      }),
    });

    const data = await response.json();

    if (data.success) {
      return true;
    }
    throw new Error(data.error || "Failed to check in");
  } catch (error: any) {
    console.error("[Attendance] Error checking in:", error);
    return false;
  }
};

// Record check-out
export const recordCheckOut = async (userId: string): Promise<boolean> => {
  try {
    const response = await fetch("/api/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId,
        action: "checkout",
      }),
    });

    const data = await response.json();

    if (data.success) {
      return true;
    }
    throw new Error(data.error || "Failed to check out");
  } catch (error: any) {
    console.error("[Attendance] Error checking out:", error);
    return false;
  }
};

// Get the currently active (unfinished) attendance record
export const getActiveRecord = async (userId: string): Promise<AttendanceRecord | null> => {
  const status = await getAttendanceStatus(userId);
  return status?.todayRecord || null;
};
