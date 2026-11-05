import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import AdminLayout from "./components/admin/AdminLayout";
import HashScroll from "./components/HashScroll";
import HomePage from "./pages/HomePage";

const DocsPage = lazy(() => import("./pages/DocsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RequestAccessPage = lazy(() => import("./pages/RequestAccessPage"));
const DomainsPanel = lazy(() => import("./components/admin/DomainsPanel"));
const DomainDetailPage = lazy(
  () => import("./components/admin/DomainDetailPage"),
);
const ApiKeysPanel = lazy(() => import("./components/admin/ApiKeysPanel"));
const OverviewPanel = lazy(() =>
  import("./pages/AdminPage").then((module) => ({
    default: module.OverviewPanel,
  })),
);
const LogsPanel = lazy(() =>
  import("./pages/AdminPage").then((module) => ({
    default: module.LogsPanel,
  })),
);
const UsersPanel = lazy(() =>
  import("./pages/AdminPage").then((module) => ({
    default: module.UsersPanel,
  })),
);
const SuppressionPanel = lazy(() =>
  import("./pages/AdminPage").then((module) => ({
    default: module.SuppressionPanel,
  })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-40 items-center justify-center text-sm text-neutral-500">
      Loading…
    </div>
  );
}

export default function App() {
  return (
    <>
      <HashScroll />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/console/login" element={<LoginPage />} />
          <Route path="/console" element={<AdminLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPanel />} />
            <Route path="domains" element={<DomainsPanel />} />
            <Route path="domains/:domainId" element={<DomainDetailPage />} />
            <Route path="api-keys" element={<ApiKeysPanel />} />
            <Route path="logs" element={<LogsPanel />} />
            <Route path="users" element={<UsersPanel />} />
            <Route path="suppression" element={<SuppressionPanel />} />
          </Route>
          <Route path="/request-access" element={<RequestAccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
