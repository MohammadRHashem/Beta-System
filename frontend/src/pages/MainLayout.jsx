import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { Routes, Route, useLocation, Navigate } from "react-router-dom";
import { io } from "socket.io-client";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";

import Sidebar from "../components/Sidebar";
import StatusIndicator from "../components/StatusIndicator";
import BroadcasterPage from "./BroadcasterPage";
import AiForwardingPage from "./AiForwardingPage";
import GroupSettingsPage from "./GroupSettingsPage";
import ChavePixPage from "./ChavePixPage";
import AbbreviationsPage from "./AbbreviationsPage";
import InvoicesPage from "./InvoicesPage";
import PositionPage from "./PositionPage"; // Add this import
import AutoConfirmationPage from "./AutoConfirmationPage";
import DirectForwardingPage from "./DirectForwardingPage";
import AlfaTrustPage from "./AlfaTrustPage";
import SubaccountsPage from "./SubaccountsPage";
import ScheduledBroadcastsPage from "./ScheduledBroadcastsPage";
import UsdtWalletsPage from "./UsdtWalletsPage";
import SubCustomersPage from "./SubCustomersPage";
import TrkbitPage from "./TrkbitPage";
import ManualReviewPage from "./ManualReviewPage";

const AppLayout = styled.div`
  display: flex;
  height: 100vh;
  background-color: ${({ theme }) => theme.background};
`;

const ContentArea = styled.main`
  flex-grow: 1;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow-y: hidden;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1.5rem 2rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  background-color: #ffffff;
  flex-shrink: 0;
`;

const PageTitle = styled.h2`
  color: ${({ theme }) => theme.primary};
  text-transform: capitalize;
  margin: 0;
`;

const PageContent = styled.div`
  padding: 2rem;
  overflow-y: auto;
  flex-grow: 1;
`;

const QRContainer = styled.div`
  padding: 2rem;
  text-align: center;
  border: 1px dashed ${({ theme }) => theme.border};
  border-radius: 8px;
  background: #fff;
  margin: 2rem;
  h2 {
    margin-bottom: 1rem;
  }
  img {
    max-width: 300px;
    width: 100%;
  }
`;

const API_URL = "https://platform.betaserver.dev:4433";

const MainLayout = () => {
  const [status, setStatus] = useState("disconnected");
  const [qrCode, setQrCode] = useState(null);
  const [allGroups, setAllGroups] = useState([]);

  const location = useLocation();
  const { logout } = useAuth();
  const pageName = location.pathname.replace("/", "").replace(/-/g, " ") || "invoices";

  // === REMOVED ALL socket useRef and useEffect logic from here ===

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

  return (
    <AppLayout>
      <Sidebar />
      <ContentArea>
        <Header>
          <PageTitle>{pageName}</PageTitle>
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
              <Route path="/scheduled-broadcasts" element={<ScheduledBroadcastsPage />} />
              <Route
                path="/subaccounts"
                element={<SubaccountsPage allGroups={allGroups} />}
              />
              <Route path="/sub-customers" element={<SubCustomersPage allGroups={allGroups} />} />
              <Route
                path="/usdt-wallets"
                element={<UsdtWalletsPage />}
              />
              <Route path="/position" element={<PositionPage />} />

              {/* The socket prop is no longer passed to the child components */}
              <Route
                path="/invoices"
                element={
                  <InvoicesPage allGroups={allGroups} />
                }
              />
              <Route path="/trkbit" element={<TrkbitPage />} />
              <Route path="/alfa-trust" element={<AlfaTrustPage />} />
              <Route
                path="/broadcaster"
                element={<BroadcasterPage allGroups={allGroups} />}
              />
              <Route path="/abbreviations" element={<AbbreviationsPage />} />
              <Route
                path="/ai-forwarding"
                element={<AiForwardingPage allGroups={allGroups} />}
              />
              <Route path="/auto-confirmation" element={<AutoConfirmationPage />} />
              <Route path="/direct-forwarding" element={<DirectForwardingPage allGroups={allGroups} />} />
              <Route path="/chave-pix" element={<ChavePixPage />} />
              <Route path="/group-settings" element={<GroupSettingsPage />} />
              <Route path="/manual-review" element={<ManualReviewPage allGroups={allGroups} />} />
              <Route path="*" element={<Navigate to="/invoices" replace />} />
            </Routes>
          )}
        </PageContent>
      </ContentArea>
    </AppLayout>
  );
};

export default MainLayout;