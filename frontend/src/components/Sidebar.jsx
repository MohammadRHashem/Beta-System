import React from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import { FaWhatsapp, FaBullhorn, FaRobot, FaCog, FaKey, FaKeyboard, FaFileInvoiceDollar, FaChartLine, FaCheckCircle, FaRoute, FaUniversity, FaUsers, FaBitcoin, FaCalendarAlt, FaUserFriends, FaCheckDouble, FaClipboardList, FaCodeBranch } from "react-icons/fa";
import { usePermissions } from '../context/PermissionContext';

const SidebarContainer = styled.nav`
  width: 250px;
  height: 100vh;
  background-color: #ffffff;
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({ theme }) => theme.border};
  flex-shrink: 0;
  box-shadow: 0 0 15px rgba(0, 0, 0, 0.03);
`;

const Title = styled.h1`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.primary};
  padding: 0 1.5rem;
  margin-bottom: 2rem;

  svg {
    color: ${({ theme }) => theme.secondary};
    font-size: 2rem;
  }
`;

const NavItem = styled(NavLink)`
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.5rem;
  color: ${({ theme }) => theme.lightText};
  text-decoration: none;
  font-weight: 500;
  font-size: 1rem;
  border-left: 4px solid transparent;
  transition: all 0.2s ease-in-out;

  svg {
    font-size: 1.2rem;
  }

  &:hover {
    background-color: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.primary};
  }

  &.active {
    color: ${({ theme }) => theme.primary};
    border-left-color: ${({ theme }) => theme.secondary};
    background-color: #e6fff9;
  }
`;

const Sidebar = () => {
    const { hasPermission } = usePermissions();
    return (
      <SidebarContainer>
        <Title><FaWhatsapp /> Beta Suite</Title>
        
        {/* Conditionally render each NavItem based on permissions */}
        {hasPermission('broadcast:send') && <NavItem to="/broadcaster"><FaBullhorn /><span>Broadcaster</span></NavItem>}
        {hasPermission('subaccount:view') && <NavItem to="/subaccounts"><FaUsers /><span>Subaccounts</span></NavItem>}
        {hasPermission('finance:view_dashboards') && <NavItem to="/sub-customers"><FaUserFriends /><span>Sub Customers</span></NavItem>}
        {hasPermission('settings:edit_usdt_wallets') && <NavItem to="/usdt-wallets"><FaBitcoin /><span>USDT Wallets</span></NavItem>}
        {/* Client Requests is a core operational page, often viewable */}
        <NavItem to="/client-requests"><FaClipboardList /><span>Client Requests</span></NavItem>
        {hasPermission('settings:edit_request_triggers') && <NavItem to="/request-types"><FaCodeBranch /><span>Request Triggers</span></NavItem>}
        {hasPermission('broadcast:schedule') && <NavItem to="/scheduled-broadcasts"><FaCalendarAlt /><span>Schedules</span></NavItem>}
        
        {hasPermission('settings:view') && (
            <>
                <NavItem to="/ai-forwarding"><FaRobot /><span>AI Forwarding</span></NavItem>
                <NavItem to="/auto-confirmation"><FaCheckCircle /><span>Auto Confirmation</span></NavItem>
                <NavItem to="/direct-forwarding"><FaRoute /><span>Direct Forwarding</span></NavItem>
                <NavItem to="/abbreviations"><FaKeyboard /><span>Abbreviations</span></NavItem>
            </>
        )}

        {hasPermission('finance:view_dashboards') && <NavItem to="/position"><FaChartLine /><span>Position</span></NavItem>}
        {hasPermission('invoice:view') && <NavItem to="/invoices"><FaFileInvoiceDollar /><span>Invoices</span></NavItem>}
        
        {hasPermission('finance:view_bank_statements') && (
            <>
                <NavItem to="/trkbit"><FaUniversity /><span>Trkbit</span></NavItem>
                <NavItem to="/alfa-trust"><FaUniversity /><span>Alfa Trust</span></NavItem>
            </>
        )}
        
        {hasPermission('manual_review:view') && <NavItem to="/manual-review"><FaCheckDouble /><span>Manual Confirmation</span></NavItem>}
        {hasPermission('settings:edit_rules') && <NavItem to="/group-settings"><FaCog /><span>Group Settings</span></NavItem>}

        {/* New Admin Section */}
        {(hasPermission('admin:view_users') || hasPermission('admin:view_roles') || hasPermission('admin:view_audit_log')) && (
            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: `1px solid #E6EBF1` }}>
                {hasPermission('admin:view_users') && <NavItem to="/users"><FaUsers /><span>Users</span></NavItem>}
                {hasPermission('admin:view_roles') && <NavItem to="/roles"><FaShieldAlt /><span>Roles</span></NavItem>}
                {hasPermission('admin:view_audit_log') && <NavItem to="/audit-log"><FaHistory /><span>Audit Log</span></NavItem>}
            </div>
        )}
      </SidebarContainer>
    );
};

export default Sidebar;