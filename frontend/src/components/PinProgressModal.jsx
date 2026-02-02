import React from 'react';
import styled from 'styled-components';
import Modal from './Modal';

const ProgressContainer = styled.div`
    max-height: 80vh;
    display: flex;
    flex-direction: column;
`;

const Title = styled.h2`
    margin-bottom: 1rem;
    color: ${({ theme }) => theme.primary};
`;

const Summary = styled.div`
    display: flex;
    justify-content: space-around;
    padding: 1rem;
    background: ${({ theme }) => theme.background};
    border-radius: 8px;
    margin-bottom: 1rem;
    text-align: center;
`;

const SummaryItem = styled.div`
    font-weight: bold;
    font-size: 1.1rem;
    span {
        display: block;
        font-size: 1.5rem;
    }
    .success { color: ${({ theme }) => theme.success}; }
    .failed { color: ${({ theme }) => theme.error}; }
    .total { color: ${({ theme }) => theme.primary}; }
`;

const LogContainer = styled.div`
    flex-grow: 1;
    overflow-y: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    padding: 1rem;
    background: #fdfdfd;
`;

const LogEntry = styled.p`
    margin: 0 0 0.5rem 0;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    &.success { color: ${({ theme }) => theme.success}; }
    &.failed { color: ${({ theme }) => theme.error}; }
    &.sending { color: ${({ theme }) => theme.lightText}; }
`;

const CloseButton = styled.button`
    margin-top: 1.5rem;
    width: 100%;
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.primary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
    font-size: 1rem;
`;

const PinProgressModal = ({ isOpen, onClose, logs, summary, isComplete }) => {
    return (
        <Modal isOpen={isOpen} onClose={isComplete ? onClose : () => {}}>
            <ProgressContainer>
                <Title>{isComplete ? 'Pinning Complete' : 'Pinning in Progress...'}</Title>
                <Summary>
                    <SummaryItem>
                        <span className="total">{summary.total}</span>
                        Total
                    </SummaryItem>
                    <SummaryItem>
                        <span className="success">{summary.successful}</span>
                        Successful
                    </SummaryItem>
                    <SummaryItem>
                        <span className="failed">{summary.failed}</span>
                        Failed
                    </SummaryItem>
                </Summary>
                <LogContainer>
                    {logs.map((log, index) => (
                        <LogEntry key={index} className={log.status}>
                            {log.message}
                        </LogEntry>
                    ))}
                </LogContainer>
                <CloseButton onClick={onClose} disabled={!isComplete}>
                    {isComplete ? 'Close' : 'Please wait...'}
                </CloseButton>
            </ProgressContainer>
        </Modal>
    );
};

export default PinProgressModal;
