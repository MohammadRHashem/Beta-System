import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { FaBars, FaTimes } from "react-icons/fa";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from '../context/PermissionContext';

// --- Component Imports ---
import Sidebar from "../components/Sidebar";
import StatusIndicator from "../components/StatusIndicator";

// --- Page Imports ---
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
// --- NEW Admin Page Imports ---
import UsersPage from "./UsersPage";
import RolesPage from "./RolesPage";
import AuditLogPage from "./AuditLogPage";
import PinMessagesPage from "./PinMessagesPage";


// === HELPER COMPONENT FOR ROUTE PROTECTION ===
const ProtectedPage = ({ permission, children }) => {
    const { hasPermission } = usePermissions();
    if (!hasPermission(permission)) {
        // If a user tries to access a page they don't have permission for,
        // redirect them to a safe default page (e.g., invoices).
        return <Navigate to="/invoices" replace />;
    }
    return children;
};


// --- Styled Components ---
const AppLayout = styled.div`
  display: flex;
  height: 100dvh;
  background-color: ${({ theme }) => theme.background};
  overflow: hidden;
`;

const ContentArea = styled.main`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  min-height: ${({ theme }) => theme.appHeaderHeight};
  padding: 0.9rem 1.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background-color: ${({ theme }) => theme.surface};
  flex-shrink: 0;
  box-shadow: ${({ theme }) => theme.shadowSm};
  z-index: 20;

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding: 0.9rem 1.5rem;
  }

  @media (max-height: 800px) and (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    padding-top: 0.6rem;
    padding-bottom: 0.6rem;
  }
`;

const PageTitle = styled.h2`
  color: ${({ theme }) => theme.primary};
  text-transform: capitalize;
  margin: 0;
  font-size: clamp(1rem, 1.3vw, 1.35rem);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const HeaderLeft = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  flex: 1;
`;

const PageContent = styled.div`
  padding: clamp(0.8rem, 1.3vw, 1.35rem);
  overflow: hidden;
  flex-grow: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;

  > * {
    min-height: 0;
  }
`;

const QRContainer = styled.div`
  padding: 1.5rem;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: ${({ theme }) => theme.radiusMd};
  background: ${({ theme }) => theme.surface};
  margin: 0.5rem;
  h2 {
    margin-bottom: 1rem;
  }
  img {
    max-width: 300px;
    width: 100%;
  }
`;

const SidebarBackdrop = styled.button`
  display: none;
  border: none;
  background: rgba(10, 37, 64, 0.35);
  position: fixed;
  inset: 0;
  z-index: 30;
  cursor: pointer;

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    display: ${({ $visible }) => ($visible ? "block" : "none")};
  }
`;

const MobileMenuButton = styled.button`
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;

  @media (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    display: none;
  }
`;


// --- Main Layout Component ---
const MainLayout = () => {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [allGroups, setAllGroups] = useState([]);
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const location = useLocation();
  const { logout } = useAuth();
  const { hasPermission } = usePermissions(); // Get permission checker for the default route

  // Dynamically generate the page name from the URL path, with custom labels where needed.
  const pageName = location.pathname.replace("/", "").replace(/-/g, " ") || "invoices";
  const pageTitleOverrides = {
    '/trkbit': 'Cross Intermediação'
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

  const handleLogout = () => {
    logout();
  };

  // Determine the user's default landing page based on their permissions
  const getDefaultRoute = () => {
    if (hasPermission('invoice:view')) return '/invoices';
    if (hasPermission('manual_review:view')) return '/manual-review';
    if (hasPermission('broadcast:send')) return '/broadcaster';
    if (hasPermission('subaccount:withdrawals:view')) return '/scheduled-withdrawals';
    return '/'; // Fallback to a blank page if no permissions
  };

  return (
    <AppLayout>
      <Sidebar isOpen={isSidebarOpen} onNavigate={() => setSidebarOpen(false)} />
      <SidebarBackdrop
        type="button"
        aria-label="Close sidebar"
        $visible={isSidebarOpen}
        onClick={() => setSidebarOpen(false)}
      />
      <ContentArea>
        <Header>
          <HeaderLeft>
            <MobileMenuButton
              type="button"
              aria-label={isSidebarOpen ? "Close menu" : "Open menu"}
              onClick={() => setSidebarOpen((prev) => !prev)}
            >
              {isSidebarOpen ? <FaTimes /> : <FaBars />}
            </MobileMenuButton>
            <PageTitle>{displayPageName}</PageTitle>
          </HeaderLeft>
          <StatusIndicator status={status} onLogout={handleLogout} />
        </Header>
        <PageContent>
          {status === "qr" ? (
            <QRContainer>
              <h2>Scan to Connect WhatsApp...</h2>
              {qrCode && <img src={qrCode} alt="QR Code" />}
            </QRContainer>
          ) : (
            <Routes>
              {/* === CORE OPERATIONAL ROUTES === */}
              <Route path="/invoices" element={<ProtectedPage permission="invoice:view"><InvoicesPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/manual-review" element={<ProtectedPage permission="manual_review:view"><ManualReviewPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/client-requests" element={<ProtectedPage permission="client_requests:view"><ClientRequestsPage /></ProtectedPage>} />

              {/* === BROADCASTING ROUTES === */}
              <Route path="/broadcaster" element={<ProtectedPage permission="broadcast:send"><BroadcasterPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/scheduled-broadcasts" element={<ProtectedPage permission="broadcast:schedules:view"><ScheduledBroadcastsPage /></ProtectedPage>} />
              <Route path="/scheduled-withdrawals" element={<ProtectedPage permission="subaccount:withdrawals:view"><ScheduledWithdrawalsPage /></ProtectedPage>} />
              
              {/* === SUBACCOUNT & CLIENT ROUTES === */}
              <Route path="/subaccounts" element={<ProtectedPage permission="subaccount:view"><SubaccountsPage allGroups={allGroups} /></ProtectedPage>} />
              
              {/* === FINANCIAL & BI ROUTES === */}
              <Route path="/position" element={<ProtectedPage permission="finance:view_dashboards"><PositionPage /></ProtectedPage>} />
              <Route path="/sub-customers" element={<ProtectedPage permission="finance:view_dashboards"><SubCustomersPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/trkbit" element={<ProtectedPage permission="finance:view_bank_statements"><TrkbitPage /></ProtectedPage>} />
              <Route path="/alfa-trust" element={<ProtectedPage permission="finance:view_bank_statements"><AlfaTrustPage /></ProtectedPage>} />
              
              {/* === SETTINGS & RULES ROUTES === */}
              <Route path="/ai-forwarding" element={<ProtectedPage permission="settings:view"><AiForwardingPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/direct-forwarding" element={<ProtectedPage permission="settings:view"><DirectForwardingPage allGroups={allGroups} /></ProtectedPage>} />
              <Route path="/auto-confirmation" element={<ProtectedPage permission="settings:view"><AutoConfirmationPage /></ProtectedPage>} />
              <Route path="/abbreviations" element={<ProtectedPage permission="settings:view"><AbbreviationsPage /></ProtectedPage>} />
              <Route path="/group-settings" element={<ProtectedPage permission="settings:edit_rules"><GroupSettingsPage /></ProtectedPage>} />
              <Route path="/request-types" element={<ProtectedPage permission="settings:edit_request_triggers"><RequestTypesPage /></ProtectedPage>} />
              <Route path="/usdt-wallets" element={<ProtectedPage permission="usdt_wallets:view"><UsdtWalletsPage /></ProtectedPage>} />

              {/* === NEW ADMIN ROUTES === */}
              <Route path="/users" element={<ProtectedPage permission="admin:view_users"><UsersPage /></ProtectedPage>} />
              <Route path="/roles" element={<ProtectedPage permission="admin:view_roles"><RolesPage /></ProtectedPage>} />
              <Route path="/audit-log" element={<ProtectedPage permission="admin:view_audit_log"><AuditLogPage /></ProtectedPage>} />
              <Route path="/pin-messages" element={<ProtectedPage permission="pin:view"><PinMessagesPage allGroups={allGroups} /></ProtectedPage>} />

              {/* === LEGACY & REDIRECTS === */}
              <Route path="/wallet-requests" element={<Navigate to="/client-requests" replace />} />
              <Route path="/chave-pix" element={<Navigate to="/subaccounts" replace />} />
              
              {/* Default route redirects to user's permitted landing page */}
              <Route path="*" element={<Navigate to={getDefaultRoute()} replace />} />
            </Routes>
          )}
        </PageContent>
      </ContentArea>
    </AppLayout>
  );
};

export default MainLayout;
