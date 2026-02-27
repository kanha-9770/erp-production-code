"use client";

import { useState, useEffect } from "react";
import { Providers } from "@/components/providers";
import AuthContainer from "@/components/auth/auth-container";

export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for user data in sessionStorage on mount
    const checkAuth = async () => {
      const storedUser = sessionStorage.getItem("user");
      if (storedUser) {
        setUser(JSON.parse(storedUser)); // Restore user from sessionStorage
      }
      setIsLoading(false);
    };

    checkAuth();
  }, []);

  const handleAuthSuccess = (userData: any) => {
    setUser(userData);
    // Store user data in sessionStorage
    sessionStorage.setItem("user", JSON.stringify(userData));
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Providers>
        <AuthContainer onAuthSuccess={handleAuthSuccess} />
      </Providers>
    );
  }

  return <Providers>{children}</Providers>;
}