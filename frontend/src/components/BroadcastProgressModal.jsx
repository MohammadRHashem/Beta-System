import React from 'react';
import styled from 'styled-components';
import Modal from './Modal'; // We reuse our existing Modal component

const ProgressContainer = styled.div`
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const Title = styled.h2`
    margin-bottom: 1rem;
    color: ${({ theme }) => theme.primary};
`;

const Summary = styled.div`
    display: flex;
    justify-content: space-around;
    padding: 0.85rem;
    background: ${({ theme }) => theme.background};
    border-radius: 10px;
    margin-bottom: 0.6rem;
    text-align: center;
    gap: 0.6rem;
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
    border-radius: 8px;
    padding: 0.8rem;
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
    margin-top: 0.7rem;
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.primary};
    color: white;
    border: none;
    padding: 0.68rem 0.9rem;
    border-radius: 8px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
    font-size: 1rem;
`;

const CancelButton = styled.button`
    margin-top: 0.7rem;
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.error};
    color: white;
    border: none;
    padding: 0.68rem 0.9rem;
    border-radius: 8px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
    font-size: 1rem;
`;

const ActionRow = styled.div`
    display: grid;
    gap: 0.6rem;
    grid-template-columns: ${({ hasCancel }) => hasCancel ? '1fr 1fr' : '1fr'};
`;

const BroadcastProgressModal = ({
    isOpen,
    onClose,
    logs,
    summary,
    isComplete,
    onCancel,
    canCancel = false,
    isCancelling = false,
}) => {
    const hasCancelButton = canCancel && !isComplete;

    return (
        <Modal isOpen={isOpen} onClose={isComplete ? onClose : () => {}}>
            <ProgressContainer>
                <Title>{isComplete ? 'Broadcast Complete' : 'Broadcasting in Progress...'}</Title>
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
                    <SummaryItem>
                        <span>{summary.cancelled || 0}</span>
                        Cancelled
                    </SummaryItem>
                </Summary>
                <LogContainer>
                    {logs.map((log, index) => (
                        <LogEntry key={index} className={log.status}>
                            {log.message}
                        </LogEntry>
                    ))}
                </LogContainer>
                <ActionRow hasCancel={hasCancelButton}>
                    {hasCancelButton && (
                        <CancelButton onClick={onCancel} disabled={isCancelling}>
                            {isCancelling ? 'Cancelling...' : 'Cancel Broadcast'}
                        </CancelButton>
                    )}
                    <CloseButton onClick={onClose} disabled={!isComplete}>
                        {isComplete ? 'Close' : 'Please wait...'}
                    </CloseButton>
                </ActionRow>
            </ProgressContainer>
        </Modal>
    );
};

export default BroadcastProgressModal;
