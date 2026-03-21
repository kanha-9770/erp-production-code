"use client";

import { useRouter } from "next/navigation";
import ResetPasswordView from "@/components/auth/ResetPasswordView";
import type { AuthView } from "@/components/auth/types";

interface ResetPasswordFormProps {
  userId?: string | null;
}

export default function ResetPasswordForm({ userId }: ResetPasswordFormProps) {
  const router = useRouter();

  const handleSwitchView = (view: AuthView) => {
    if (view === "forgot-password") {
      router.push("/forgot-password");
    } else if (view === "login") {
      router.push("/auth");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-4">
      <ResetPasswordView
        userId={userId ?? undefined}
        onSwitchView={handleSwitchView}
      />
    </div>
  );
}
