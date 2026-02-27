// components/UserBootstrap.tsx
"use client";

import { useCurrentUser } from "@/hooks/useCurrentUser";

export const UserBootstrap = () => {
  const { fullName, isLoading } = useCurrentUser();

  if (isLoading) return null;

  return <>{fullName}</>;
};
