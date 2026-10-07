"use client";

import { createContext, useContext } from "react";

import type { UserProfile } from "@/common/auth/types";

const AdminSessionContext = createContext<UserProfile | null>(null);

export function AdminSessionProvider({
  profile,
  children,
}: {
  profile: UserProfile;
  children: React.ReactNode;
}) {
  return (
    <AdminSessionContext.Provider value={profile}>
      {children}
    </AdminSessionContext.Provider>
  );
}

export function useAdminSession() {
  return useContext(AdminSessionContext);
}
