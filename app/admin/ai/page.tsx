import type { Metadata } from "next";
import AIConfigClient from "@/components/admin/ai/ai-config-client";

export const metadata: Metadata = {
  title: "AI Providers",
  description: "Manage cloud AI providers, API keys, and model selection",
};

export default function AIAdminPage() {
  return <AIConfigClient />;
}
