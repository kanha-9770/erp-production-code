import type { Metadata } from "next";
import ChatbotUI from "@/components/chatbot/chatbot-ui";

export const metadata: Metadata = {
  title: "Chatbot",
  description: "Chat with your configured AI provider",
};

export default function ChatbotPage() {
  return <ChatbotUI />;
}
