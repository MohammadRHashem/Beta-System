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

const Container = styled.aside`
  width: ${({ theme }) => theme.sidebarWidth};
  height: 100dvh;
  color: ${({ theme }) => theme.sidebarText};
  background: ${({ theme }) => theme.sidebarGradient};
  border-right: 1px solid ${({ theme }) => theme.sidebarBorder};
  box-shadow: ${({ theme }) => theme.shadowSm};
  display: flex;
  flex-direction: column;
  z-index: 40;
  overflow: hidden;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;

  @media (max-width: ${({ theme }) => theme.breakpoints.desktop}) and (min-width: ${({ theme }) => theme.breakpoints.tablet}) {
    width: ${({ theme }) => theme.sidebarWidthCompact};
  }

  @media (max-width: ${({ theme }) => theme.breakpoints.tablet}) {
    position: fixed;
    left: 0;
    top: 0;
    width: min(84vw, ${({ theme }) => theme.sidebarWidth});
    transform: translateX(${({ $isOpen }) => ($isOpen ? "0%" : "-105%")});
    transition: transform 0.2s ease;
  }
`;

const Brand = styled.div`
  height: ${({ theme }) => theme.appHeaderHeight};
  display: flex;
  align-items: center;
  gap: 0.62rem;
  padding: 0 0.85rem;
  border-bottom: 1px solid ${({ theme }) => theme.sidebarBorder};
`;

const BrandMark = styled.div`
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 6px;
  background: linear-gradient(140deg, ${({ theme }) => theme.secondary}, ${({ theme }) => theme.primarySoft});
  color: ${({ theme }) => (theme.mode === "dark" ? "#05101f" : "#ffffff")};
  display: inline-flex;
  align-items: center;
  justify-content: center;
`;

const BrandName = styled.h1`
  margin: 0;
  font-size: 0.96rem;
  color: ${({ theme }) => theme.sidebarText};
`;

const Body = styled.div`
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 0.62rem 0.45rem 0.8rem;
`;

const SectionTitle = styled.p`
  margin: 0.58rem 0.48rem 0.32rem;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${({ theme }) => theme.sidebarMuted};
`;

const Item = styled(NavLink)`
  display: grid;
  grid-template-columns: 1.55rem 1fr;
  align-items: center;
  gap: 0.55rem;
  margin: 0.12rem 0.25rem;
  padding: 0.46rem 0.52rem;
  border-radius: 8px;
  color: ${({ theme }) => theme.sidebarText};
  border: 1px solid transparent;
  font-weight: 700;
  font-size: 0.81rem;

  .icon {
    width: 1.55rem;
    height: 1.55rem;
    border-radius: 6px;
    background: ${({ theme }) => theme.sidebarIconBg};
    color: ${({ theme }) => theme.sidebarIconText};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.85rem;
  }

  &:hover {
    background: ${({ theme }) => theme.sidebarHover};
    border-color: ${({ theme }) => theme.sidebarBorder};
  }

  &.active {
    background: ${({ theme }) => theme.sidebarActiveBg};
    border-color: ${({ theme }) => theme.sidebarActiveBorder};
    box-shadow: inset 0 0 0 1px ${({ theme }) => theme.sidebarActiveBorder};
  }
`;

const Divider = styled.div`
  height: 1px;
  margin: 0.42rem 0.5rem;
  background: ${({ theme }) => theme.sidebarBorder};
`;

const Sidebar = ({ isOpen = true, onNavigate = null }) => {
  const { hasPermission } = usePermissions();
  const go = () => {
    if (typeof onNavigate === "function") onNavigate();
  };

  return (
    <Container $isOpen={isOpen}>
      <Brand>
        <BrandMark>
          <FiGrid />
        </BrandMark>
        <BrandName>Beta Suite</BrandName>
      </Brand>

      <Body>
        <SectionTitle>Operations</SectionTitle>
        {hasPermission("broadcast:send") && (
          <Item to="/broadcaster" onClick={go}>
            <span className="icon"><FiSend /></span>
            <span>Broadcaster</span>
          </Item>
        )}
        {hasPermission("subaccount:view") && (
          <Item to="/subaccounts" onClick={go}>
            <span className="icon"><FiUsers /></span>
            <span>Subaccounts</span>
          </Item>
        )}
        {hasPermission("finance:view_dashboards") && (
          <Item to="/sub-customers" onClick={go}>
            <span className="icon"><FiUserPlus /></span>
            <span>Sub Customers</span>
          </Item>
        )}
        {hasPermission("usdt_wallets:view") && (
          <Item to="/usdt-wallets" onClick={go}>
            <span className="icon"><FiDollarSign /></span>
            <span>USDT Wallets</span>
          </Item>
        )}
        {hasPermission("client_requests:view") && (
          <Item to="/client-requests" onClick={go}>
            <span className="icon"><FiClipboard /></span>
            <span>Client Requests</span>
          </Item>
        )}
        {hasPermission("settings:edit_request_triggers") && (
          <Item to="/request-types" onClick={go}>
            <span className="icon"><FiGitBranch /></span>
            <span>Request Triggers</span>
          </Item>
        )}
        {hasPermission("broadcast:schedules:view") && (
          <Item to="/scheduled-broadcasts" onClick={go}>
            <span className="icon"><FiCalendar /></span>
            <span>Schedules</span>
          </Item>
        )}
        {hasPermission("subaccount:withdrawals:view") && (
          <Item to="/scheduled-withdrawals" onClick={go}>
            <span className="icon"><FiRepeat /></span>
            <span>Withdrawals</span>
          </Item>
        )}
        {hasPermission("pin:view") && (
          <Item to="/pin-messages" onClick={go}>
            <span className="icon"><FiMapPin /></span>
            <span>Pin Messages</span>
          </Item>
        )}

        {hasPermission("settings:view") && (
          <>
            <Divider />
            <SectionTitle>Automation</SectionTitle>
            <Item to="/ai-forwarding" onClick={go}>
              <span className="icon"><FiCpu /></span>
              <span>AI Forwarding</span>
            </Item>
            <Item to="/auto-confirmation" onClick={go}>
              <span className="icon"><FiCheckCircle /></span>
              <span>Auto Confirmation</span>
            </Item>
            <Item to="/direct-forwarding" onClick={go}>
              <span className="icon"><FiShare2 /></span>
              <span>Direct Forwarding</span>
            </Item>
            <Item to="/abbreviations" onClick={go}>
              <span className="icon"><FiType /></span>
              <span>Abbreviations</span>
            </Item>
          </>
        )}

        <Divider />
        <SectionTitle>Finance</SectionTitle>
        {hasPermission("finance:view_dashboards") && (
          <Item to="/position" onClick={go}>
            <span className="icon"><FiActivity /></span>
            <span>Position</span>
          </Item>
        )}
        {hasPermission("invoice:view") && (
          <Item to="/invoices" onClick={go}>
            <span className="icon"><FiFileText /></span>
            <span>Invoices</span>
          </Item>
        )}
        {hasPermission("finance:view_bank_statements") && (
          <Item to="/trkbit" onClick={go}>
            <span className="icon"><FiSettings /></span>
            <span>Cross Intermediacao</span>
          </Item>
        )}
        {hasPermission("manual_review:view") && (
          <Item to="/manual-review" onClick={go}>
            <span className="icon"><FiCheckSquare /></span>
            <span>Manual Confirmation</span>
          </Item>
        )}
        {hasPermission("settings:edit_rules") && (
          <Item to="/group-settings" onClick={go}>
            <span className="icon"><FiSliders /></span>
            <span>Group Settings</span>
          </Item>
        )}

        {(hasPermission("admin:view_users") ||
          hasPermission("admin:view_roles") ||
          hasPermission("admin:view_audit_log")) && (
          <>
            <Divider />
            <SectionTitle>Administration</SectionTitle>
            {hasPermission("admin:view_users") && (
              <Item to="/users" onClick={go}>
                <span className="icon"><FiUser /></span>
                <span>Users</span>
              </Item>
            )}
            {hasPermission("admin:view_roles") && (
              <Item to="/roles" onClick={go}>
                <span className="icon"><FiShield /></span>
                <span>Roles</span>
              </Item>
            )}
            {hasPermission("admin:view_audit_log") && (
              <Item to="/audit-log" onClick={go}>
                <span className="icon"><FiClock /></span>
                <span>Audit Log</span>
              </Item>
            )}
          </>
        )}
      </Body>
    </Container>
  );
};

export default Sidebar;
