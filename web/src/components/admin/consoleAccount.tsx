import { createContext, useContext, type ReactNode } from "react";
import { Navigate } from "react-router-dom";

import { PageLoading } from "../ui/ScanLoading";

export type ConsoleAccountState = {
  ready: boolean;
  isAdmin: boolean;
};

const ConsoleAccountContext = createContext<ConsoleAccountState>({
  ready: false,
  isAdmin: false,
});

export function ConsoleAccountProvider({
  value,
  children,
}: {
  value: ConsoleAccountState;
  children: ReactNode;
}) {
  return <ConsoleAccountContext.Provider value={value}>{children}</ConsoleAccountContext.Provider>;
}

export function useConsoleAccount(): ConsoleAccountState {
  return useContext(ConsoleAccountContext);
}

export function AdminOnly({ children }: { children: ReactNode }) {
  const account = useConsoleAccount();
  if (!account.ready) {
    return <PageLoading>Loading…</PageLoading>;
  }
  if (!account.isAdmin) {
    return <Navigate to="/console/overview" replace />;
  }
  return children;
}
