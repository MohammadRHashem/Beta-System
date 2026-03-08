import React from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import {
  FiActivity,
  FiCalendar,
  FiCheckCircle,
  FiCheckSquare,
  FiClock,
  FiClipboard,
  FiCpu,
  FiDollarSign,
  FiFileText,
  FiGitBranch,
  FiGrid,
  FiMapPin,
  FiRepeat,
  FiSend,
  FiSettings,
  FiShare2,
  FiShield,
  FiSliders,
  FiType,
  FiUser,
  FiUserPlus,
  FiUsers,
} from "react-icons/fi";
import { usePermissions } from "../context/PermissionContext";

const SidebarContainer = styled.nav`
  width: ${({ theme }) => theme.sidebarWidth};
  height: 100vh;
  background: ${({ theme }) => theme.sidebarGradient};
  color: ${({ theme }) => theme.sidebarText};
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.borderStrong};
  flex-shrink: 0;
  box-shadow: ${({ theme }) => theme.shadowMd};
  overflow-y: auto;
  z-index: 40;

  @media (max-width: ${({ theme }) => theme.breakpoints.desktop}) and (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    width: ${({ theme }) => theme.sidebarWidthCompact};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    position: fixed;
    top: 0;
    left: 0;
    width: min(82vw, ${({ theme }) => theme.sidebarWidth});
    transform: translateX(${({ $isOpen }) => ($isOpen ? "0" : "-100%")});
    transition: transform 0.24s ease;
    box-shadow: ${({ theme }) => theme.shadowMd};
  }
`;

const Brand = styled.div`
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.3rem 0.75rem 1rem;
  margin-bottom: 0.35rem;
  border-bottom: 1px solid ${({ theme }) => theme.sidebarBorder};
`;

const BrandIcon = styled.div`
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 0.7rem;
  background: linear-gradient(145deg, ${({ theme }) => theme.secondary}, ${({ theme }) => theme.primarySoft});
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => (theme.mode === 'dark' ? '#041022' : '#f8fbff')};
  flex-shrink: 0;
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 1.08rem;
  color: ${({ theme }) => theme.sidebarText};
  margin: 0;
  letter-spacing: 0.01em;

  @media (max-height: 800px) {
    font-size: 1rem;
  }
`;

const SectionLabel = styled.p`
  margin: 0.95rem 0.5rem 0.45rem;
  font-size: 0.73rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 700;
  color: ${({ theme }) => theme.sidebarMuted};
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 0.72rem;
  padding: 0.66rem 0.72rem;
  color: ${({ theme }) => theme.sidebarText};
  text-decoration: none;
  font-weight: 700;
  font-size: 0.9rem;
  transition: all 0.2s ease-in-out;
  border: 1px solid transparent;
  border-radius: 12px;
  margin: 0.16rem 0.3rem;
  position: relative;

  .icon {
    width: 1.8rem;
    height: 1.8rem;
    border-radius: 9px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: ${({ theme }) => theme.sidebarIconBg};
    color: ${({ theme }) => theme.sidebarIconText};
    font-size: 0.95rem;
    flex-shrink: 0;
  }

  &:hover {
    background-color: ${({ theme }) => theme.sidebarHover};
    border-color: ${({ theme }) => theme.sidebarBorder};
    color: ${({ theme }) => theme.sidebarText};
  }

  &.active {
    color: ${({ theme }) => theme.sidebarText};
    background: ${({ theme }) => theme.sidebarActiveBg};
    border-color: ${({ theme }) => theme.sidebarActiveBorder};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.sidebarActiveBorder};

    .icon {
      background: ${({ theme }) => theme.secondarySoft};
      color: ${({ theme }) => theme.secondary};
    }
  }

  @media (max-height: 800px) {
    padding: 0.54rem 0.66rem;
    font-size: 0.9rem;
  }
`;

const SectionDivider = styled.div`
  height: 1px;
  margin: 0.8rem 0.5rem;
  background: ${({ theme }) => theme.sidebarBorder};
`;

const BottomSection = styled.div`
  margin-top: auto;
  padding-top: 0.5rem;
`;

const NavBody = styled.div`
  display: flex;
  flex-direction: column;
  min-height: 0;
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
      <Brand>
        <BrandIcon><FiGrid /></BrandIcon>
        <Title>Beta Suite</Title>
      </Brand>

      <NavBody>
        <SectionLabel>Operations</SectionLabel>

        {hasPermission("broadcast:send") && (
          <NavItem to="/broadcaster" onClick={handleNavigate}>
            <span className="icon"><FiSend /></span>
            <span>Broadcaster</span>
          </NavItem>
        )}
        {hasPermission("subaccount:view") && (
          <NavItem to="/subaccounts" onClick={handleNavigate}>
            <span className="icon"><FiUsers /></span>
            <span>Subaccounts</span>
          </NavItem>
        )}
        {hasPermission("finance:view_dashboards") && (
          <NavItem to="/sub-customers" onClick={handleNavigate}>
            <span className="icon"><FiUserPlus /></span>
            <span>Sub Customers</span>
          </NavItem>
        )}
        {hasPermission("usdt_wallets:view") && (
          <NavItem to="/usdt-wallets" onClick={handleNavigate}>
            <span className="icon"><FiDollarSign /></span>
            <span>USDT Wallets</span>
          </NavItem>
        )}
        {hasPermission("client_requests:view") && (
          <NavItem to="/client-requests" onClick={handleNavigate}>
            <span className="icon"><FiClipboard /></span>
            <span>Client Requests</span>
          </NavItem>
        )}
        {hasPermission("settings:edit_request_triggers") && (
          <NavItem to="/request-types" onClick={handleNavigate}>
            <span className="icon"><FiGitBranch /></span>
            <span>Request Triggers</span>
          </NavItem>
        )}
        {hasPermission("broadcast:schedules:view") && (
          <NavItem to="/scheduled-broadcasts" onClick={handleNavigate}>
            <span className="icon"><FiCalendar /></span>
            <span>Schedules</span>
          </NavItem>
        )}
        {hasPermission("subaccount:withdrawals:view") && (
          <NavItem to="/scheduled-withdrawals" onClick={handleNavigate}>
            <span className="icon"><FiRepeat /></span>
            <span>Withdrawals</span>
          </NavItem>
        )}
        {hasPermission("pin:view") && (
          <NavItem to="/pin-messages" onClick={handleNavigate}>
            <span className="icon"><FiMapPin /></span>
            <span>Pin Messages</span>
          </NavItem>
        )}

        {hasPermission("settings:view") && (
          <>
            <SectionDivider />
            <SectionLabel>Automation</SectionLabel>
            <NavItem to="/ai-forwarding" onClick={handleNavigate}>
              <span className="icon"><FiCpu /></span>
              <span>AI Forwarding</span>
            </NavItem>
            <NavItem to="/auto-confirmation" onClick={handleNavigate}>
              <span className="icon"><FiCheckCircle /></span>
              <span>Auto Confirmation</span>
            </NavItem>
            <NavItem to="/direct-forwarding" onClick={handleNavigate}>
              <span className="icon"><FiShare2 /></span>
              <span>Direct Forwarding</span>
            </NavItem>
            <NavItem to="/abbreviations" onClick={handleNavigate}>
              <span className="icon"><FiType /></span>
              <span>Abbreviations</span>
            </NavItem>
          </>
        )}

        <SectionDivider />
        <SectionLabel>Finance</SectionLabel>
        {hasPermission("finance:view_dashboards") && (
          <NavItem to="/position" onClick={handleNavigate}>
            <span className="icon"><FiActivity /></span>
            <span>Position</span>
          </NavItem>
        )}
        {hasPermission("invoice:view") && (
          <NavItem to="/invoices" onClick={handleNavigate}>
            <span className="icon"><FiFileText /></span>
            <span>Invoices</span>
          </NavItem>
        )}

        {hasPermission("finance:view_bank_statements") && (
          <NavItem to="/trkbit" onClick={handleNavigate}>
            <span className="icon"><FiSettings /></span>
            <span>Cross Intermediacao</span>
          </NavItem>
        )}

        {hasPermission("manual_review:view") && (
          <NavItem to="/manual-review" onClick={handleNavigate}>
            <span className="icon"><FiCheckSquare /></span>
            <span>Manual Confirmation</span>
          </NavItem>
        )}
        {hasPermission("settings:edit_rules") && (
          <NavItem to="/group-settings" onClick={handleNavigate}>
            <span className="icon"><FiSliders /></span>
            <span>Group Settings</span>
          </NavItem>
        )}

        {(hasPermission("admin:view_users") ||
          hasPermission("admin:view_roles") ||
          hasPermission("admin:view_audit_log")) && (
          <BottomSection>
            <SectionDivider />
            <SectionLabel>Administration</SectionLabel>
            {hasPermission("admin:view_users") && (
              <NavItem to="/users" onClick={handleNavigate}>
                <span className="icon"><FiUser /></span>
                <span>Users</span>
              </NavItem>
            )}
            {hasPermission("admin:view_roles") && (
              <NavItem to="/roles" onClick={handleNavigate}>
                <span className="icon"><FiShield /></span>
                <span>Roles</span>
              </NavItem>
            )}
            {hasPermission("admin:view_audit_log") && (
              <NavItem to="/audit-log" onClick={handleNavigate}>
                <span className="icon"><FiClock /></span>
                <span>Audit Log</span>
              </NavItem>
            )}
          </BottomSection>
        )}
      </NavBody>
    </SidebarContainer>
  );
};

export default Sidebar;
