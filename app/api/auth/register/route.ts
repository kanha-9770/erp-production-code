export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOTPEmail } from "@/lib/email";
import { generateOTP, hashPassword } from "@/lib/auth";
import { RegisterSchema } from "@/lib/utils/validations";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password } = RegisterSchema.parse(body);

    // Check if user already exists and is verified
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.email_verified) {
      return NextResponse.json(
        { error: "User already exists with this email" },
        { status: 400 },
      );
    }

    // Hash the password
    const hashedPassword = await hashPassword(password);

    // Generate OTP
    const otp = generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);

    let user;

    if (!existingUser) {
      // Create new user without an organization
      user = await prisma.user.create({
        data: {
          first_name: name,
          email,
          password: hashedPassword,
          email_verified: false,
          status: "PENDING_VERIFICATION",
        },
      });
    } else {
      // Update existing user with new data
      user = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          first_name: name,
          password: hashedPassword,
        },
      });
    }

    // Create or update OTP
    await prisma.oTPCode.upsert({
      where: {
        userId_type: {
          userId: user.id,
          type: "REGISTRATION",
        },
      },
      create: {
        userId: user.id,
        code: otp,
        type: "REGISTRATION",
        expiresAt,
      },
      update: {
        code: otp,
        expiresAt,
        used: false,
        attempts: 0,
      },
    });

    // Send OTP email
    const emailResult = await sendOTPEmail(email, otp, "registration");

    if (!emailResult.success) {
      return NextResponse.json(
        { error: "Failed to send verification email" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Verification code sent to your email",
      userId: user.id,
    });
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
