import twilio, { type Twilio } from "twilio"

// SMSResponse Interface
interface SMSResponse {
  success: boolean
  messageId?: string
  error?: string
}

// Generate OTP for SMS
export const generateSMSOTP = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Send OTP via SMS using Twilio
export const sendOTPSMS = async (
  phoneNumber: string,
  otp: string,
  purpose: "registration" | "login" | "password_reset",
): Promise<SMSResponse> => {
  try {
    console.log("Preparing to send SMS:", { phoneNumber, otp, purpose })

    // Validate phone number
    if (!isValidPhoneNumber(phoneNumber)) {
      throw new Error("Invalid phone number format. Must be in E.164 format (e.g., +917014612375).")
    }

    // Validate environment variables
    const accountSid = process.env.TWILIO_ACCOUNT_SID
    const authToken = process.env.TWILIO_AUTH_TOKEN
    const apiKeySid = process.env.TWILIO_API_KEY_SID
    const apiSecret = process.env.TWILIO_API_SECRET
    const fromNumber = process.env.TWILIO_SMS_FROM_NUMBER

    if (!accountSid || !accountSid.startsWith("AC")) {
      throw new Error('Invalid or missing TWILIO_ACCOUNT_SID. Must start with "AC".')
    }

    if (!fromNumber || !isValidPhoneNumber(fromNumber)) {
      throw new Error("Invalid or missing TWILIO_SMS_FROM_NUMBER. Must be in E.164 format (e.g., +917014612375).")
    }

    if (!authToken && !(apiKeySid && apiSecret)) {
      throw new Error(
        "Missing Twilio authentication credentials (TWILIO_AUTH_TOKEN or TWILIO_API_KEY_SID and TWILIO_API_SECRET).",
      )
    }

    // Initialize Twilio client
    let client: Twilio
    if (apiKeySid && apiSecret) {
      client = twilio(apiKeySid, apiSecret, { accountSid })
    } else {
      client = twilio(accountSid, authToken!)
    }

    const message = await client.messages.create({
      body: getSMSMessage(otp, purpose),
      from: fromNumber,
      to: phoneNumber,
    })

    console.log("SMS sent successfully:", message.sid)
    return {
      success: true,
      messageId: message.sid,
    }
  } catch (error: any) {
    console.error("Error sending SMS:", {
      message: error.message,
      code: error.code,
      status: error.status,
      moreInfo: error.moreInfo,
    })

    return {
      success: false,
      error: error.message || "Failed to send SMS. Please try again.",
    }
  }
}

// Get SMS message based on purpose
const getSMSMessage = (otp: string, purpose: "registration" | "login" | "password_reset"): string => {
  const purposeText = {
    registration: "complete your registration",
    login: "sign in to your account",
    password_reset: "reset your password",
  }

  return `Your verification code is: ${otp}. Use this code to ${purposeText[purpose]}. Valid for 5 minutes. Never share this code.`
}

// Validate phone number format
export const isValidPhoneNumber = (phone: string): boolean => {
  // Enforce E.164 format (e.g., +917014612375)
  const phoneRegex = /^\+[1-9]\d{1,14}$/
  return phoneRegex.test(phone)
}

// Format phone number for display (mask middle digits)
export const maskPhoneNumber = (phone: string): string => {
  if (phone.length < 4) return phone
  const start = phone.slice(0, 2)
  const end = phone.slice(-2)
  const middle = "*".repeat(phone.length - 4)
  return `${start}${middle}${end}`
}
