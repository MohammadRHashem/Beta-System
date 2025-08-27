import React from 'react';
import styled from 'styled-components';

const StatusWrapper = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
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
    font-weight: 500;
`;

const LogoutButton = styled.button`
  background-color: ${({ theme }) => theme.error};
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
  &:hover {
    opacity: 0.9;
  }
`;

const StatusIndicator = ({ status, onLogout }) => {
    return (
        <StatusWrapper>
            <Dot status={status} />
            <StatusText>{status}</StatusText>
            {/* {status === 'connected' && <LogoutButton onClick={onLogout}>Logout</LogoutButton>} */}
        </StatusWrapper>
    );
};

export default StatusIndicator;