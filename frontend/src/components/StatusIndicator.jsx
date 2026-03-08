import React from 'react';
import styled from 'styled-components';
import { FiLogOut, FiRadio } from 'react-icons/fi';

const StatusWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
`;

const StatusBadge = styled.div`
    padding: 0.34rem 0.62rem;
    border-radius: 999px;
    border: 1px solid ${({ status, theme }) => {
        if (status === 'connected') return 'rgba(19, 184, 135, 0.4)';
        if (status === 'qr') return 'rgba(245, 158, 11, 0.4)';
        return 'rgba(229, 72, 77, 0.42)';
    }};
    background: ${({ status }) => {
        if (status === 'connected') return 'rgba(19, 184, 135, 0.16)';
        if (status === 'qr') return 'rgba(245, 158, 11, 0.18)';
        return 'rgba(229, 72, 77, 0.18)';
    }};
    color: ${({ status, theme }) => {
        if (status === 'connected') return theme.success;
        if (status === 'qr') return theme.warning;
        return theme.error;
    }};
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-weight: 700;
    font-size: 0.8rem;
`;

const StatusText = styled.span`
    text-transform: capitalize;
    font-weight: 700;
    font-size: 0.78rem;
    color: currentColor;
    white-space: nowrap;

    @media (max-width: 680px) {
        display: none;
    }
`;

const LogoutButton = styled.button`
  background-color: ${({ theme }) => theme.error};
  color: white;
  border: 1px solid transparent;
  padding: 0.46rem 0.72rem;
  border-radius: 999px;
  cursor: pointer;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  &:hover {
    filter: brightness(1.05);
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
            <StatusBadge status={status}>
                <FiRadio />
                <StatusText>{status}</StatusText>
            </StatusBadge>
            {onLogout && (
              <LogoutButton onClick={onLogout}>
                <FiLogOut />
                <LogoutLabel>Logout</LogoutLabel>
              </LogoutButton>
            )}
        </StatusWrapper>
    );
};

export default StatusIndicator;
