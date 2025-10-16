import React from "react";
import { NavLink } from "react-router-dom";
import styled from "styled-components";
import { FaWhatsapp, FaBullhorn, FaRobot, FaCog, FaKey, FaKeyboard, FaFileInvoiceDollar, FaChartLine, FaCheckCircle, FaRoute, FaUniversity } from "react-icons/fa";

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
    return (
        <SidebarContainer>
            <Title><FaWhatsapp /> Beta Suite</Title>
            <NavItem to="/broadcaster"><FaBullhorn /><span>Broadcaster</span></NavItem>
            <NavItem to="/ai-forwarding"><FaRobot /><span>AI Forwarding</span></NavItem>
            {/* === NEW: Link to the Auto Confirmation Page === */}
            <NavItem to="/auto-confirmation"><FaCheckCircle /><span>Auto Confirmation</span></NavItem>
            <NavItem to="/direct-forwarding"><FaRoute /><span>Direct Forwarding</span></NavItem>
            <NavItem to="/abbreviations"><FaKeyboard /><span>Abbreviations</span></NavItem>
            <NavItem to="/chave-pix"><FaKey /><span>Chave PIX</span></NavItem>
            <NavItem to="/position"><FaChartLine /><span>Position</span></NavItem>
            <NavItem to="/invoices"><FaFileInvoiceDollar /><span>Invoices</span></NavItem>
            <NavItem to="/alfa-trust"><FaUniversity /><span>Alfa Trust</span></NavItem>
            <NavItem to="/group-settings"><FaCog /><span>Group Settings</span></NavItem>
        </SidebarContainer>
    );
};

export default Sidebar;