"use client";

import { useChat } from "@ai-sdk/react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Send, Plus, Trash2, MessageSquare } from "lucide-react";
import { useGetConversationsQuery, useCreateConversationMutation, useDeleteConversationMutation } from "@/lib/api/chat";

interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

interface FormChatbotProps {
  userId: string;
}

export function FormChatbot({ userId }: FormChatbotProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<
    string | null
  >(null);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, input, handleInputChange, handleSubmit, isLoading } =
    useChat({
      api: "/api/chat",
      body: {
        conversationId: currentConversationId,
      },
    });

  // Mount check to prevent hydration mismatch
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Load conversations via RTK Query
  const { data: conversationsData, isLoading: isLoadingConvs } = useGetConversationsQuery(undefined, { skip: !isMounted });

  useEffect(() => {
    if (conversationsData) {
      setConversations(conversationsData);
      setIsLoadingConversations(false);
    }
    if (!isLoadingConvs && !conversationsData) {
      setIsLoadingConversations(false);
    }
  }, [conversationsData, isLoadingConvs]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const [createConversationMut] = useCreateConversationMutation();
  const [deleteConversationMut] = useDeleteConversationMutation();

  const createNewConversation = async () => {
    try {
      const newConversation = await createConversationMut({
        title: `Chat ${new Date().toLocaleString()}`,
      }).unwrap();
      setConversations((prev) => [newConversation, ...prev]);
      setCurrentConversationId(newConversation.id);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await deleteConversationMut(conversationId).unwrap();

      setConversations((prev) =>
        prev.filter((conv) => conv.id !== conversationId),
      );

      if (currentConversationId === conversationId) {
        setCurrentConversationId(null);
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const selectConversation = async (conversationId: string) => {
    setCurrentConversationId(conversationId);
  };

  if (!isMounted) {
    return null;
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-2xl mx-auto space-y-4">
            {messages.length === 0 && currentConversationId === null && (
              <Card className="p-12 text-center bg-card border-border">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-xl font-semibold mb-2">
                  Start a conversation
                </h2>
                <p className="text-muted-foreground">
                  Create a new chat to get started with your form assistant
                </p>
              </Card>
            )}

            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${
                  message.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                <div
                  className={`max-w-md p-4 rounded-lg ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-none"
                      : "bg-secondary text-secondary-foreground rounded-bl-none"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">
                    {typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content)}
                  </p>
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-secondary text-secondary-foreground p-4 rounded-lg rounded-bl-none">
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-current rounded-full animate-bounce" />
                    <div
                      className="w-2 h-2 bg-current rounded-full animate-bounce"
                      style={{ animationDelay: "0.1s" }}
                    />
                    <div
                      className="w-2 h-2 bg-current rounded-full animate-bounce"
                      style={{ animationDelay: "0.2s" }}
                    />
                  </div>
                </div>
              </div>
            )}

            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border p-6 bg-background">
          <div className="max-w-2xl mx-auto">
            {currentConversationId === null && messages.length === 0 && (
              <div className="mb-4 p-4 bg-muted rounded-lg text-sm text-muted-foreground">
                Create a new chat or select an existing conversation to start
                messaging
              </div>
            )}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={handleInputChange}
                placeholder={
                  currentConversationId
                    ? "Ask about your forms..."
                    : "Create a new chat to start"
                }
                disabled={isLoading || currentConversationId === null}
                className="flex-1"
              />
              <Button
                type="submit"
                disabled={
                  isLoading || currentConversationId === null || !input.trim()
                }
                size="icon"
              >
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
