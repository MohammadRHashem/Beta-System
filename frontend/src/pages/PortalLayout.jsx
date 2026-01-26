import React, { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import styled from "styled-components";
import { motion, AnimatePresence } from "framer-motion";
import BetaTextLogo from "../assets/betaLogo.png";
import {
  FaFileExcel,
  FaHeadset,
  FaSignOutAlt,
  FaBars,
  FaTimes,
  FaFilePdf,
} from "react-icons/fa";
import { PortalProvider, usePortal } from "../context/PortalContext";
import { exportPortalTransactions } from "../services/api";
import Modal from "../components/Modal";

// (All styled-components remain the same)
const PageContainer = styled.div`
  min-height: 100vh;
  background-color: #f6f9fc;
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23E6EBF1' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
`;
const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  background: #fff;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  @media (max-width: 768px) {
    padding: 0.75rem 1rem;
  }
`;
const Logo = styled.img`
  height: 60px;
  @media (max-width: 768px) {
    height: 45px;
  }
`;
const ClientName = styled.div`
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  color: ${({ theme }) => theme.text};
  font-weight: 600;
  font-size: 1.2rem;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 250px);
  text-transform: uppercase; /* <-- THIS LINE WAS ADDED */

  @media (max-width: 768px) {
    font-size: 1rem;
    max-width: calc(100% - 160px);
  }
`;
const DesktopNav = styled.nav`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  @media (max-width: 768px) {
    display: none;
  }
`;
const NavButton = styled.button`
  background: transparent;
  border: none;
  color: ${({ theme }) => theme.lightText};
  font-weight: 600;
  cursor: pointer;
  font-size: 0.95rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 6px;
  transition: all 0.2s;
  &:hover {
    background-color: #f6f9fc;
    color: ${({ theme }) => theme.primary};
  }
  &.logout {
    color: ${({ theme }) => theme.error};
    &:hover {
      background-color: #ffebe6;
    }
  }
`;
const MobileMenuButton = styled.button`
  display: none;
  background: transparent;
  border: none;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.primary};
  cursor: pointer;
  z-index: 1001;
  @media (max-width: 768px) {
    display: block;
  }
`;
const MobileNav = styled(motion.nav)`
  position: fixed;
  top: 0;
  right: 0;
  width: 250px;
  height: 100%;
  background: #fff;
  box-shadow: -5px 0 15px rgba(0, 0, 0, 0.1);
  display: flex;
  flex-direction: column;
  padding: 5rem 1.5rem;
  gap: 1rem;
  z-index: 1000;
`;
const Content = styled.main`
  padding: 1.5rem;
  @media (min-width: 768px) {
    padding: 2rem;
  }
`;
const ExportModalContent = styled.div`
  h2 {
    margin-top: 0;
    margin-bottom: 1.5rem;
  }
`;
const FormatButtons = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
`;
const FormatButton = styled.button`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 1.5rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
  font-size: 1rem;
  font-weight: 600;
  color: ${({ theme }) => theme.primary};
  svg {
    font-size: 2.5rem;
  }
  &:hover {
    border-color: ${({ theme }) => theme.secondary};
    color: ${({ theme }) => theme.secondary};
    transform: translateY(-3px);
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.07);
  }
`;

const ImpersonationBanner = styled.div`
  background: #0a2540;
  color: #fff;
  padding: 0.6rem 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 600;
  font-size: 0.9rem;
`;

const ImpersonationButton = styled.button`
  background: #fff;
  color: #0a2540;
  border: none;
  padding: 0.4rem 0.8rem;
  border-radius: 6px;
  font-weight: 700;
  cursor: pointer;
`;

// Helper to parse JWT without a library
const parseJwt = (token) => {
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch (e) {
    return null;
  }
};

const LayoutContent = () => {
  const navigate = useNavigate();
  const [clientInfo, setClientInfo] = useState({});
  const [isMobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const { filters } = usePortal();

  const getPortalToken = () =>
    sessionStorage.getItem("portalAuthToken") ||
    localStorage.getItem("portalAuthToken");

  const handleLogout = () => {
    if (sessionStorage.getItem("portalImpersonation") === "true") {
      sessionStorage.removeItem("portalAuthToken");
      sessionStorage.removeItem("portalClient");
      sessionStorage.removeItem("portalImpersonation");
      setIsImpersonating(false);
      navigate("/portal/login");
      return;
    }

    localStorage.removeItem("portalAuthToken");
    localStorage.removeItem("portalClient");
    sessionStorage.removeItem("portalAuthToken");
    sessionStorage.removeItem("portalClient");
    sessionStorage.removeItem("portalImpersonation");
    navigate("/portal/login");
  };

  // --- THIS IS THE FIX: Proactive session checker ---
  useEffect(() => {
    const interval = setInterval(() => {
      const token = getPortalToken();
      if (!token) {
        handleLogout();
        return;
      }
      const decodedToken = parseJwt(token);
      // Check if token is expired (exp is in seconds, Date.now() is in milliseconds)
      if (decodedToken && decodedToken.exp * 1000 < Date.now()) {
        console.log("Portal session expired. Logging out.");
        handleLogout();
      }
    }, 60000); // Check every 60 seconds

    // Cleanup on component unmount
    return () => clearInterval(interval);
  }, []); // Empty dependency array means this runs once on mount
  // --- END OF FIX ---

  useEffect(() => {
    const storedClient =
      sessionStorage.getItem("portalClient") ||
      localStorage.getItem("portalClient");
    const clientData = storedClient ? JSON.parse(storedClient) : null;
    if (clientData) setClientInfo(clientData);
    setIsImpersonating(sessionStorage.getItem("portalImpersonation") === "true");
  }, []);

  const handleExport = async (format) => {
    setIsExportModalOpen(false);
    try {
      await exportPortalTransactions(filters, format);
    } catch {
      alert("Could not export data. Please try again.");
    }
  };

  const navActions = (
    <>
      <NavButton onClick={() => setIsExportModalOpen(true)}>
        <FaFileExcel /> Export
      </NavButton>
      <NavButton
        onClick={() =>
          alert("Contact admins on whatsapp group for any help or support")
        }
      >
        <FaHeadset /> Contact Support
      </NavButton>
      <NavButton className="logout" onClick={handleLogout}>
        <FaSignOutAlt /> Logout
      </NavButton>
    </>
  );

  return (
    <PageContainer>
      <Header>
        <Logo src={BetaTextLogo} alt="Beta Logo" />
        <ClientName>{clientInfo.username || "Client Dashboard"}</ClientName>
        <DesktopNav>{navActions}</DesktopNav>
        <MobileMenuButton onClick={() => setMobileMenuOpen(!isMobileMenuOpen)}>
          {isMobileMenuOpen ? <FaTimes /> : <FaBars />}
        </MobileMenuButton>
      </Header>
      {isImpersonating && (
        <ImpersonationBanner>
          <span>Impersonating client portal (full access)</span>
          <ImpersonationButton onClick={handleLogout}>
            Exit
          </ImpersonationButton>
        </ImpersonationBanner>
      )}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <MobileNav
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", ease: "easeInOut", duration: 0.3 }}
          >
            {navActions}
          </MobileNav>
        )}
      </AnimatePresence>
      <Content>
        <Outlet />
      </Content>
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
      >
        <ExportModalContent>
          <h2>Choose Export Format</h2>
          <FormatButtons>
            <FormatButton onClick={() => handleExport("excel")}>
              <FaFileExcel style={{ color: "#217346" }} />
              Excel (.xlsx)
            </FormatButton>
            <FormatButton onClick={() => handleExport("pdf")}>
              <FaFilePdf style={{ color: "#B30B00" }} />
              PDF (.pdf)
            </FormatButton>
          </FormatButtons>
        </ExportModalContent>
      </Modal>
    </PageContainer>
  );
};

const PortalLayout = () => {
  return (
    <PortalProvider>
      <LayoutContent />
    </PortalProvider>
  );
};

export default PortalLayout;
