import React from 'react';
import styled from 'styled-components';
import { FaSignOutAlt } from 'react-icons/fa';

const StatusWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 0.55rem;
    min-width: 0;
`;

const Dot = styled.span`
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background-color: ${({ status, theme }) => {
        if (status === 'connected') return theme.success;
        if (status === 'qr') return '#f39c12';
        return theme.error;
    }};
`;

const StatusText = styled.span`
    text-transform: capitalize;
    font-weight: 600;
    font-size: 0.9rem;
    color: ${({ theme }) => theme.lightText};
    white-space: nowrap;

    @media (max-width: 680px) {
        display: none;
    }
`;

const LogoutButton = styled.button`
  background-color: ${({ theme }) => theme.error};
  color: white;
  border: none;
  padding: 0.45rem 0.7rem;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  &:hover {
    opacity: 0.9;
  }
`;

const LogoutLabel = styled.span`
  @media (max-width: 680px) {
    display: none;
  }
`;

const StatusIndicator = ({ status, onLogout }) => {
    return (
        <StatusWrapper>
            <Dot status={status} />
            <StatusText>{status}</StatusText>
            {onLogout && (
              <LogoutButton onClick={onLogout}>
                <FaSignOutAlt />
                <LogoutLabel>Logout</LogoutLabel>
              </LogoutButton>
            )}
        </StatusWrapper>
    );
};

export default StatusIndicator;
