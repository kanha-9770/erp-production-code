import nodemailer from "nodemailer"

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number.parseInt(process.env.EMAIL_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
})

export const sendOTPEmail = async (
  email: string,
  otp: string,
  type: "registration" | "login" | "password_reset" = "registration",
) => {
  // If email configuration is missing, return success for development
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) {
    console.log(`[DEV] OTP Email would be sent to ${email}: ${otp} (type: ${type})`)
    return { success: true }
  }

  let subject, title, message

  switch (type) {
    case "registration":
      subject = "Verify Your Email - Registration OTP"
      title = "Complete Your Registration"
      message = "Thank you for signing up! Please use the verification code below to complete your registration:"
      break
    case "login":
      subject = "Login Verification Code"
      title = "Login Verification"
      message = "Please use the verification code below to complete your login:"
      break
    case "password_reset":
      subject = "Password Reset Code"
      title = "Reset Your Password"
      message = "You requested to reset your password. Please use the verification code below to proceed:"
      break
    default:
      subject = "Verification Code"
      title = "Email Verification"
      message = "Please use the verification code below:"
  }

  const mailOptions = {
    from: {
      name: process.env.EMAIL_FROM_NAME || "App5",
      address: process.env.EMAIL_FROM || "",
    },
    to: email,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f8fafc; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); overflow: hidden; }
            .header { background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 40px 30px; text-align: center; }
            .content { padding: 40px 30px; text-align: center; }
            .otp-code { display: inline-block; background: #f1f5f9; border: 2px solid #e2e8f0; border-radius: 8px; padding: 20px 30px; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #1e293b; margin: 20px 0; }
            .footer { background: #f8fafc; padding: 20px 30px; text-align: center; color: #64748b; font-size: 14px; border-top: 1px solid #e2e8f0; }
            .warning { background: #fef3cd; border: 1px solid #fbbf24; border-radius: 6px; padding: 15px; margin: 20px 0; color: #92400e; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0; font-size: 28px;">${title}</h1>
            </div>
              <div class="content">
              <p style="color: #475569; font-size: 16px; line-height: 1.6;">
                ${message}
              </p>
              <div class="otp-code">${otp}</div>
              <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                This verification code will expire in <strong>10 minutes</strong> for your security.
              </p>
              <div class="warning">
                <strong>Security Note:</strong> Never share this code with anyone. ${type === "password_reset" ? "If you did not request a password reset, please ignore this email and contact support." : "Our team will never ask for your verification code."}
              </div>
            </div>
            <div class="footer">
              <p style="margin: 0;">
                If you didn't ${type === "registration" ? "sign up" : type === "password_reset" ? "request a password reset" : "request this login"}, please ignore this email.
              </p>
              <p style="margin: 10px 0 0 0;">© 2025 App5. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `,
  }

  try {
    await transporter.sendMail(mailOptions)
    return { success: true }
  } catch (error: any) {
    console.error("Email sending failed:", error)
    return { success: false, error: error.message }
  }
}
