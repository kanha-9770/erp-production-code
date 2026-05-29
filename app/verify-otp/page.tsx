// import { Suspense } from "react"
// import AuthPanel from "@/components/auth/AuthPanel"

// export default function VerifyOTPPage({
//   searchParams,
// }: {
//   searchParams: { userId?: string; type?: string }
// }) {
//   return (
//     <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
//       <AuthPanel
//         initialView="verify-otp"
//         initialUserId={searchParams.userId}
//         initialOtpType={searchParams.type}
//       />
//     </Suspense>
//   )
// }


import { Suspense } from "react"
import AuthPanel from "@/components/auth/AuthPanel"

export default async function VerifyOTPPage(
  props: {
    searchParams: Promise<{ userId?: string; type?: string }>
  }
) {
  const searchParams = await props.searchParams;
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-600 font-medium">Loading verification...</p>
        </div>
      </div>
    }>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30 flex items-center justify-center p-4 sm:p-6 md:p-8">
        <div className="w-full max-w-md sm:max-w-lg md:max-w-xl lg:max-w-2xl mx-auto">
          {/* Optional subtle card wrapper for better visual hierarchy on larger screens */}
          <div className="bg-white/80 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-xl border border-slate-200/60 overflow-hidden">
            <AuthPanel
              initialView="verify-otp"
              initialUserId={searchParams.userId}
              initialOtpType={searchParams.type}
            />
          </div>

          {/* Optional footer / branding - appears only on larger screens */}
          <div className="mt-6 text-center text-xs sm:text-sm text-slate-500 hidden sm:block">
            Secure OTP verification • Powered by your app
          </div>
        </div>
      </div>
    </Suspense>
  )
}