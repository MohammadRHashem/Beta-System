import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { FiMenu, FiMoon, FiSun, FiX } from "react-icons/fi";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from "../context/PermissionContext";
import { useThemeMode } from "../context/ThemeModeContext";

import Sidebar from "../components/Sidebar";
import StatusIndicator from "../components/StatusIndicator";

import BroadcasterPage from "./BroadcasterPage";
import InvoicesPage from "./InvoicesPage";
import SubaccountsPage from "./SubaccountsPage";
import ManualReviewPage from "./ManualReviewPage";
import ScheduledBroadcastsPage from "./ScheduledBroadcastsPage";
import ScheduledWithdrawalsPage from "./ScheduledWithdrawalsPage";
import SubCustomersPage from "./SubCustomersPage";
import UsdtWalletsPage from "./UsdtWalletsPage";
import PositionPage from "./PositionPage";
import ClientRequestsPage from "./ClientRequestsPage";
import RequestTypesPage from "./RequestTypesPage";
import TrkbitPage from "./TrkbitPage";
import AlfaTrustPage from "./AlfaTrustPage";
import AiForwardingPage from "./AiForwardingPage";
import AutoConfirmationPage from "./AutoConfirmationPage";
import DirectForwardingPage from "./DirectForwardingPage";
import AbbreviationsPage from "./AbbreviationsPage";
import GroupSettingsPage from "./GroupSettingsPage";
import UsersPage from "./UsersPage";
import RolesPage from "./RolesPage";
import AuditLogPage from "./AuditLogPage";
import PinMessagesPage from "./PinMessagesPage";

const ProtectedPage = ({ permission, children }) => {
  const { hasPermission } = usePermissions();
  if (!hasPermission(permission)) return <Navigate to="/invoices" replace />;
  return children;
};

const Shell = styled.div`
  height: 100dvh;
  width: 100%;
  display: grid;
  grid-template-columns: auto 1fr;
  overflow: hidden;
  background: ${({ theme }) => theme.background};
`;

const Main = styled.main`
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const Topbar = styled.header`
  height: ${({ theme }) => theme.appHeaderHeight};
  min-height: ${({ theme }) => theme.appHeaderHeight};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0 0.72rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.headerGradient};
  box-shadow: ${({ theme }) => theme.shadowSm};
`;

const Left = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
  flex: 1;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.06rem;
  font-weight: 800;
  text-transform: capitalize;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const Right = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
`;

const IconButton = styled.button`
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const MenuButton = styled(IconButton)`
  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    display: none;
  }
`;

const Content = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
  padding: 0.56rem;
`;

const Viewport = styled.div`
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: auto;
  border-radius: 14px;
  background: ${({ theme }) =>
    theme.mode === "dark"
      ? "linear-gradient(165deg, rgba(12,21,38,0.92), rgba(18,31,52,0.92))"
      : "linear-gradient(165deg, rgba(255,255,255,0.92), rgba(246,250,255,0.9))"};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 0.56rem;
`;

const PageSlot = styled.section`
  width: 100%;
  max-width: 1800px;
  margin: 0 auto;
  min-height: 100%;
  display: flex;
  flex-direction: column;
  overflow: visible;
  padding: 0.14rem;

  > * {
    flex: 1;
    min-height: 0;
  }

  h2 {
    margin-bottom: 0.3rem;
  }

  button {
    font-size: 0.78rem;
    min-height: 30px;
  }

  input,
  select,
  textarea {
    font-size: 0.8rem;
    min-height: 30px;
  }

  table {
    font-size: 0.78rem;
  }

  th,
  td {
    padding: 0.42rem 0.52rem;
  }
`;

const SidebarBackdrop = styled.button`
  display: none;
  position: fixed;
  inset: 0;
  border: 0;
  background: rgba(7, 11, 20, 0.42);
  z-index: 30;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    display: ${({ $visible }) => ($visible ? "block" : "none")};
  }
`;

const QrPanel = styled.div`
  min-height: 320px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  border: 1px dashed ${({ theme }) => theme.borderStrong};
  background: ${({ theme }) => theme.surface};
  text-align: center;
  padding: 1rem;
  gap: 0.7rem;

  img {
    max-width: 260px;
    width: 100%;
    height: auto;
  }
`;

const MainLayout = () => {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const location = useLocation();
  const { logout } = useAuth();
  const { hasPermission } = usePermissions();
  const { toggleMode, isDark } = useThemeMode();

  const pageName = location.pathname.replace("/", "").replace(/-/g, " ") || "invoices";
  const pageTitleOverrides = {
    "/trkbit": "Cross Intermediacao",
  };
  const displayPageName = pageTitleOverrides[location.pathname] || pageName;

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  const fetchAllGroupsForConfig = useCallback(async () => {
    try {
      const groupsRes = await api.get("/groups");
      setAllGroups(groupsRes.data || []);
    } catch (error) {
      console.error("Error fetching groups for config:", error);
    }
  }, []);

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/status");
      setStatus(data.status);
      if (data.status === "qr") {
        setQrCode(data.qr || null);
      } else {
        setQrCode(null);
        if (data.status === "connected" && allGroups.length === 0) {
          fetchAllGroupsForConfig();
        }
      }
    } catch (error) {
      console.error("Error checking status:", error);
    }
  }, [allGroups.length, fetchAllGroupsForConfig]);

  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const getDefaultRoute = () => {
    if (hasPermission("invoice:view")) return "/invoices";
    if (hasPermission("manual_review:view")) return "/manual-review";
    if (hasPermission("broadcast:send")) return "/broadcaster";
    if (hasPermission("subaccount:withdrawals:view")) return "/scheduled-withdrawals";
    return "/";
  };

  const slot = (content) => <PageSlot>{content}</PageSlot>;
  const protectedSlot = (permission, content) => (
    <ProtectedPage permission={permission}>{slot(content)}</ProtectedPage>
  );

  return (
    <Shell data-admin-layout>
      <Sidebar isOpen={isSidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <SidebarBackdrop
        type="button"
        aria-label="Close sidebar"
        $visible={isSidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />

      <Main>
        <Topbar>
          <Left>
            <MenuButton
              type="button"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              {isSidebarOpen ? <FiX /> : <FiMenu />}
            </MenuButton>
            <Title>{displayPageName}</Title>
          </Left>

          <Right>
            <IconButton
              type="button"
              onClick={toggleMode}
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
              title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? <FiSun /> : <FiMoon />}
            </IconButton>
            <StatusIndicator status={status} onLogout={logout} />
          </Right>
        </Topbar>

        <Content>
          <Viewport>
            {status === "qr" ? (
              <PageSlot>
                <QrPanel>
                  <h2>Scan to Connect WhatsApp</h2>
                  {qrCode && <img src={qrCode} alt="QR Code" />}
                </QrPanel>
              </PageSlot>
            ) : (
              <Routes>
                <Route
                  path="/invoices"
                  element={protectedSlot("invoice:view", <InvoicesPage allGroups={allGroups} />)}
                />
                <Route
                  path="/manual-review"
                  element={protectedSlot("manual_review:view", <ManualReviewPage allGroups={allGroups} />)}
                />
                <Route
                  path="/client-requests"
                  element={protectedSlot("client_requests:view", <ClientRequestsPage />)}
                />

                <Route
                  path="/broadcaster"
                  element={protectedSlot("broadcast:send", <BroadcasterPage allGroups={allGroups} />)}
                />
                <Route
                  path="/scheduled-broadcasts"
                  element={protectedSlot("broadcast:schedules:view", <ScheduledBroadcastsPage />)}
                />
                <Route
                  path="/scheduled-withdrawals"
                  element={protectedSlot("subaccount:withdrawals:view", <ScheduledWithdrawalsPage />)}
                />
                <Route
                  path="/subaccounts"
                  element={protectedSlot("subaccount:view", <SubaccountsPage allGroups={allGroups} />)}
                />

                <Route
                  path="/position"
                  element={protectedSlot("finance:view_dashboards", <PositionPage />)}
                />
                <Route
                  path="/sub-customers"
                  element={protectedSlot("finance:view_dashboards", <SubCustomersPage allGroups={allGroups} />)}
                />
                <Route
                  path="/trkbit"
                  element={protectedSlot("finance:view_bank_statements", <TrkbitPage />)}
                />
                <Route
                  path="/alfa-trust"
                  element={protectedSlot("finance:view_bank_statements", <AlfaTrustPage />)}
                />

                <Route
                  path="/ai-forwarding"
                  element={protectedSlot("settings:view", <AiForwardingPage allGroups={allGroups} />)}
                />
                <Route
                  path="/direct-forwarding"
                  element={protectedSlot("settings:view", <DirectForwardingPage allGroups={allGroups} />)}
                />
                <Route
                  path="/auto-confirmation"
                  element={protectedSlot("settings:view", <AutoConfirmationPage />)}
                />
                <Route
                  path="/abbreviations"
                  element={protectedSlot("settings:view", <AbbreviationsPage />)}
                />
                <Route
                  path="/group-settings"
                  element={protectedSlot("settings:edit_rules", <GroupSettingsPage />)}
                />
                <Route
                  path="/request-types"
                  element={protectedSlot("settings:edit_request_triggers", <RequestTypesPage />)}
                />
                <Route
                  path="/usdt-wallets"
                  element={protectedSlot("usdt_wallets:view", <UsdtWalletsPage />)}
                />

                <Route path="/users" element={protectedSlot("admin:view_users", <UsersPage />)} />
                <Route path="/roles" element={protectedSlot("admin:view_roles", <RolesPage />)} />
                <Route path="/audit-log" element={protectedSlot("admin:view_audit_log", <AuditLogPage />)} />
                <Route
                  path="/pin-messages"
                  element={protectedSlot("pin:view", <PinMessagesPage allGroups={allGroups} />)}
                />

                <Route path="/wallet-requests" element={<Navigate to="/client-requests" replace />} />
                <Route path="/chave-pix" element={<Navigate to="/subaccounts" replace />} />
                <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
              </Routes>
            )}
          </Viewport>
        </Content>
      </Main>
    </Shell>
  );
};

export default MainLayout;
