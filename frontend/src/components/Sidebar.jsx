import React from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import {
  FaWhatsapp,
  FaBullhorn,
  FaRobot,
  FaCog,
  FaKeyboard,
  FaFileInvoiceDollar,
  FaChartLine,
  FaCheckCircle,
  FaRoute,
  FaUniversity,
  FaUsers,
  FaBitcoin,
  FaCalendarAlt,
  FaUserFriends,
  FaCheckDouble,
  FaClipboardList,
  FaCodeBranch,
  FaShieldAlt,
  FaHistory,
  FaThumbtack,
  FaExchangeAlt,
} from "react-icons/fa";
import { usePermissions } from "../context/PermissionContext";

const SidebarContainer = styled.nav`
  width: ${({ theme }) => theme.sidebarWidth};
  height: 100vh;
  background-color: ${({ theme }) => theme.surface};
  padding: 1rem 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
  box-shadow: ${({ theme }) => theme.shadowSm};
  overflow-y: auto;
  z-index: 40;

  @media (max-width: ${({ theme }) => theme.breakpoints.desktop}) and (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    width: ${({ theme }) => theme.sidebarWidthCompact};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    position: fixed;
    top: 0;
    left: 0;
    transform: translateX(${({ $isOpen }) => ($isOpen ? "0" : "-100%")});
    transition: transform 0.24s ease;
    box-shadow: ${({ theme }) => theme.shadowMd};
  }
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.35rem;
  color: ${({ theme }) => theme.primary};
  padding: 0 1.5rem;
  margin-bottom: 1rem;

  svg {
    color: ${({ theme }) => theme.secondary};
    font-size: 1.9rem;
  }

  @media (max-height: 800px) {
    margin-bottom: 0.7rem;
    font-size: 1.2rem;
  }
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.8rem 1.2rem;
  color: ${({ theme }) => theme.lightText};
  text-decoration: none;
  font-weight: 600;
  font-size: 0.95rem;
  border-left: 4px solid transparent;
  transition: all 0.2s ease-in-out;
  border-radius: 0 999px 999px 0;
  margin-right: 0.7rem;

  svg {
    font-size: 1rem;
  }

  &:hover {
    background-color: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
  }

  &.active {
    color: ${({ theme }) => theme.primary};
    border-left-color: ${({ theme }) => theme.secondary};
    background: linear-gradient(
      90deg,
      rgba(0, 196, 154, 0.18),
      rgba(0, 196, 154, 0.04)
    );
  }

  @media (max-height: 800px) {
    padding: 0.65rem 1rem;
    font-size: 0.9rem;
  }
`;

const SectionDivider = styled.div`
  height: 1px;
  margin: 0.9rem 1rem;
  background: ${({ theme }) => theme.border};
`;

const BottomSection = styled.div`
  margin-top: auto;
  padding-top: 0.5rem;
`;

const Sidebar = ({ isOpen = true, onNavigate = null }) => {
  const { hasPermission } = usePermissions();
  const handleNavigate = () => {
    if (typeof onNavigate === "function") {
      onNavigate();
    }
  };

  return (
    <SidebarContainer $isOpen={isOpen}>
      <Title>
        <FaWhatsapp /> Beta Suite
      </Title>

      {hasPermission("broadcast:send") && (
        <NavItem to="/broadcaster" onClick={handleNavigate}>
          <FaBullhorn />
          <span>Broadcaster</span>
        </NavItem>
      )}
      {hasPermission("subaccount:view") && (
        <NavItem to="/subaccounts" onClick={handleNavigate}>
          <FaUsers />
          <span>Subaccounts</span>
        </NavItem>
      )}
      {hasPermission("finance:view_dashboards") && (
        <NavItem to="/sub-customers" onClick={handleNavigate}>
          <FaUserFriends />
          <span>Sub Customers</span>
        </NavItem>
      )}
      {hasPermission("usdt_wallets:view") && (
        <NavItem to="/usdt-wallets" onClick={handleNavigate}>
          <FaBitcoin />
          <span>USDT Wallets</span>
        </NavItem>
      )}
      {hasPermission("client_requests:view") && (
        <NavItem to="/client-requests" onClick={handleNavigate}>
          <FaClipboardList />
          <span>Client Requests</span>
        </NavItem>
      )}
      {hasPermission("settings:edit_request_triggers") && (
        <NavItem to="/request-types" onClick={handleNavigate}>
          <FaCodeBranch />
          <span>Request Triggers</span>
        </NavItem>
      )}
      {hasPermission("broadcast:schedules:view") && (
        <NavItem to="/scheduled-broadcasts" onClick={handleNavigate}>
          <FaCalendarAlt />
          <span>Schedules</span>
        </NavItem>
      )}
      {hasPermission("subaccount:withdrawals:view") && (
        <NavItem to="/scheduled-withdrawals" onClick={handleNavigate}>
          <FaExchangeAlt />
          <span>Withdrawals</span>
        </NavItem>
      )}
      {hasPermission("pin:view") && (
        <NavItem to="/pin-messages" onClick={handleNavigate}>
          <FaThumbtack />
          <span>Pin Messages</span>
        </NavItem>
      )}

      {hasPermission("settings:view") && (
        <>
          <SectionDivider />
          <NavItem to="/ai-forwarding" onClick={handleNavigate}>
            <FaRobot />
            <span>AI Forwarding</span>
          </NavItem>
          <NavItem to="/auto-confirmation" onClick={handleNavigate}>
            <FaCheckCircle />
            <span>Auto Confirmation</span>
          </NavItem>
          <NavItem to="/direct-forwarding" onClick={handleNavigate}>
            <FaRoute />
            <span>Direct Forwarding</span>
          </NavItem>
          <NavItem to="/abbreviations" onClick={handleNavigate}>
            <FaKeyboard />
            <span>Abbreviations</span>
          </NavItem>
        </>
      )}

      {hasPermission("finance:view_dashboards") && (
        <NavItem to="/position" onClick={handleNavigate}>
          <FaChartLine />
          <span>Position</span>
        </NavItem>
      )}
      {hasPermission("invoice:view") && (
        <NavItem to="/invoices" onClick={handleNavigate}>
          <FaFileInvoiceDollar />
          <span>Invoices</span>
        </NavItem>
      )}

      {hasPermission("finance:view_bank_statements") && (
        <NavItem to="/trkbit" onClick={handleNavigate}>
          <FaUniversity />
          <span>Cross Intermediacao</span>
        </NavItem>
      )}

      {hasPermission("manual_review:view") && (
        <NavItem to="/manual-review" onClick={handleNavigate}>
          <FaCheckDouble />
          <span>Manual Confirmation</span>
        </NavItem>
      )}
      {hasPermission("settings:edit_rules") && (
        <NavItem to="/group-settings" onClick={handleNavigate}>
          <FaCog />
          <span>Group Settings</span>
        </NavItem>
      )}

      {(hasPermission("admin:view_users") ||
        hasPermission("admin:view_roles") ||
        hasPermission("admin:view_audit_log")) && (
        <BottomSection>
          <SectionDivider />
          {hasPermission("admin:view_users") && (
            <NavItem to="/users" onClick={handleNavigate}>
              <FaUsers />
              <span>Users</span>
            </NavItem>
          )}
          {hasPermission("admin:view_roles") && (
            <NavItem to="/roles" onClick={handleNavigate}>
              <FaShieldAlt />
              <span>Roles</span>
            </NavItem>
          )}
          {hasPermission("admin:view_audit_log") && (
            <NavItem to="/audit-log" onClick={handleNavigate}>
              <FaHistory />
              <span>Audit Log</span>
            </NavItem>
          )}
        </BottomSection>
      )}
    </SidebarContainer>
  );
};

export default Sidebar;
