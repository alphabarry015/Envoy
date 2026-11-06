import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AdminOnly } from "./components/admin/consoleAccount";
import HashScroll from "./components/HashScroll";
import { PageLoading } from "./components/ui/ScanLoading";
import HomePage from "./pages/HomePage";

const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const AcceptInvitePage = lazy(() => import("./pages/AcceptInvitePage"));
const RequestAccessPage = lazy(() => import("./pages/RequestAccessPage"));
const DomainsPanel = lazy(() => import("./components/admin/DomainsPanel"));
const DomainDetailPage = lazy(
  () => import("./components/admin/DomainDetailPage"),
);
const EmailsPanel = lazy(() => import("./components/admin/EmailsPanel"));
const EmailDetailPage = lazy(() => import("./components/admin/EmailDetailPage"));
const TemplatesPanel = lazy(() => import("./components/admin/TemplatesPanel"));
const StarterTemplatesPage = lazy(
  () => import("./components/admin/StarterTemplatesPage"),
);
const TemplateDetailPage = lazy(
  () => import("./components/admin/TemplateDetailPage"),
);
const ApiKeysPanel = lazy(() => import("./components/admin/ApiKeysPanel"));
const WebhooksPanel = lazy(() => import("./components/admin/WebhooksPanel"));
const LogsPanel = lazy(() => import("./components/admin/LogsPanel"));
const LogDetailPage = lazy(() => import("./components/admin/LogDetailPage"));
const OverviewPanel = lazy(() =>
  import("./pages/AdminPage").then((module) => ({
    default: module.OverviewPanel,
  })),
);
const UsersPanel = lazy(() => import("./components/admin/UsersPanel"));
const SuppressionPanel = lazy(
  () => import("./components/admin/SuppressionPanel"),
);
const ProfilePage = lazy(() => import("./components/admin/ProfilePage"));
const SettingsPage = lazy(() => import("./components/admin/SettingsPage"));

function RouteFallback() {
  return (
    <PageLoading className="min-h-svh">Loading…</PageLoading>
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
          <Route path="/auth/accept-invite" element={<AcceptInvitePage />} />
          <Route path="/console" element={<AdminLayout />}>
            <Route index element={<Navigate to="overview" replace />} />
            <Route path="overview" element={<OverviewPanel />} />
            <Route path="emails" element={<EmailsPanel />} />
            <Route path="emails/:emailId" element={<EmailDetailPage />} />
            <Route path="domains" element={<DomainsPanel />} />
            <Route path="domains/:domainId" element={<DomainDetailPage />} />
            <Route path="templates" element={<TemplatesPanel />} />
            <Route path="templates/gallery" element={<StarterTemplatesPage />} />
            <Route path="templates/:templateId" element={<TemplateDetailPage />} />
            <Route path="api-keys" element={<ApiKeysPanel />} />
            <Route path="webhooks" element={<WebhooksPanel />} />
            <Route path="logs" element={<LogsPanel />} />
            <Route path="logs/:logId" element={<LogDetailPage />} />
            <Route path="users" element={<AdminOnly><UsersPanel /></AdminOnly>} />
            <Route path="suppression" element={<SuppressionPanel />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="settings" element={<SettingsPage />} />
          </Route>
          <Route path="/request-access" element={<RequestAccessPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
