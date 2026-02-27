"use server"

import { prisma } from "@/lib/prisma"

export async function handleSubmit(formId: string, formData: FormData, userAgent: string) {
  try {
    const recordData: Record<string, any> = {}
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        recordData[key] = value.name
      } else {
        recordData[key] = value
      }
    }

    const result = await prisma.formRecord1.create({
      data: {
        formId,
        recordData,
        submittedBy: "anonymous",
        userAgent,
      },
    })

    await prisma.formEvent.create({
      data: {
        formId,
        eventType: "submit",
        payload: {
          recordId: result.id,
          timestamp: new Date().toISOString(),
        },
      },
    })

    return { success: true, data: result }
  } catch (error: any) {
    console.error("Submission error:", error)
    return { success: false, error: error.message || "Submission failed" }
  }
}