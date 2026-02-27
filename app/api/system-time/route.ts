export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

/**
 * Secure API endpoint to get current server date and time
 * This prevents client-side manipulation of date/time values
 */
export async function GET() {
  try {
    const now = new Date();
    
    // Format date as YYYY-MM-DD
    const date = now.toISOString().split('T')[0];
    
    // Format time as HH:MM (24-hour format)
    const time = now.toTimeString().split(' ')[0].substring(0, 5);
    
    // Format datetime as YYYY-MM-DDTHH:MM
    const datetime = `${date}T${time}`;
    
    return NextResponse.json({
      success: true,
      data: {
        date,
        time,
        datetime,
        timestamp: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error getting system time:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to get system time',
      },
      { status: 500 }
    );
  }
}
