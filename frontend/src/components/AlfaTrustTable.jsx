import React from 'react';
import styled, { css } from 'styled-components';
import { FaDownload, FaLink, FaUnlink } from 'react-icons/fa';
import Pagination from './Pagination';

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    border: 1px solid ${({ theme }) => theme.border};
    /* This is crucial: Make the wrapper a flex container that grows and allows scrolling */
    flex-grow: 1;
    overflow-y: auto; /* Enable vertical scrolling ONLY on the table wrapper */
    position: relative; /* Needed for the sticky header */
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
`;

const Thead = styled.thead`
    position: sticky;
    top: 0;
    z-index: 1;
`;

const Th = styled.th`
    padding: 0.8rem 1rem;
    text-align: left;
    background-color: ${({ theme }) => theme.background};
    font-weight: 600;
    white-space: nowrap;
    border-bottom: 2px solid ${({ theme }) => theme.border};
`;

const Tr = styled.tr`
    border-bottom: 1px solid ${({ theme }) => theme.border};
    &:last-child {
        border-bottom: none;
    }
    &:hover {
        background-color: #f6f9fc;
    }
`;

const Td = styled.td`
    padding: 0.8rem 1rem;
    vertical-align: middle;
    white-space: nowrap;

    &.actions {
        font-size: 1rem;
        color: ${({ theme }) => theme.lightText};
        svg {
            cursor: pointer;
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
    }
    
    &.currency {
        text-align: right;
        font-family: 'Courier New', Courier, monospace;
        font-weight: 600;
        ${({ isCredit }) => isCredit ? css`color: ${({ theme }) => theme.success};` : css`color: ${({ theme }) => theme.error};`}
    }
`;

const ActionIcon = styled.span`
    cursor: pointer;
    font-size: 1.1rem;
    color: ${({ theme, linked }) => linked ? theme.success : theme.lightText};
    &:hover {
        color: ${({ theme, linked }) => linked ? theme.success : theme.primary};
    }
`;

const AlfaTrustTable = ({ transactions, loading, pagination, setPagination, onLinkClick }) => {
    const formatDateTime = (isoString) => {
        if (!isoString) return 'N/A';
        try {
            return new Date(isoString).toLocaleString('pt-BR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch (e) {
            return isoString;
        }
    };
    
    const handleDownloadReceipt = (tx) => {
        alert(`Receipt download for individual transactions is not supported by the bank's API at this time.`);
    };

    if (loading) return <p>Loading transactions...</p>;
    if (!transactions || transactions.length === 0) return <p>No transactions found.</p>;

    return (
        <>
            <TableWrapper>
                <Table>
                    <Thead>
                        <tr>
                            <Th>Date/Time</Th>
                            <Th>Transaction ID</Th>
                            <Th>Counterparty Name</Th>
                            <Th className="currency" style={{color: '#32325D'}}>Amount</Th>
                            <Th>Actions</Th>
                        </tr>
                    </Thead>
                    <tbody>
                        {transactions.map((tx) => {
                            // === THE FIX: Robust counterparty name logic with fallback ===
                            let counterpartyName = 'N/A';
                            let transactionId = tx.end_to_end_id || tx.transaction_id || 'N/A';

                            if (tx.operation === 'C') { // Credit (IN)
                                counterpartyName = tx.payer_name || tx.description || 'N/A';
                            } else { // Debit (OUT)
                                let details = null;
                                try {
                                    // The backend sends raw_details as a JSON string, so we must parse it.
                                    if (tx.raw_details && typeof tx.raw_details === 'string') {
                                        details = JSON.parse(tx.raw_details);
                                    } else {
                                        details = tx.raw_details; // It's already an object or null
                                    }
                                } catch (e) {
                                    details = null; // Ensure details is null on JSON parsing error
                                }
                                
                                // For debits, try to get the recipient name first. 
                                // If it doesn't exist (like in a fee), fall back to the top-level description.
                                if (tx.operation === 'C') { // Credit (IN)
                                counterpartyName = tx.payer_name || tx.description || 'N/A';
                                } else { // Debit (OUT)
                                    counterpartyName = details?.detalhes?.nomeRecebedor || tx.description || 'N/A';
                                }
                            }
                            // === END OF FIX ===

                            return (
                                <Tr key={tx.id}>
                                    <Td>{formatDateTime(tx.inclusion_date)}</Td>
                                    <Td>{tx.transaction_id || tx.end_to_end_id}</Td>
                                    <Td>{counterpartyName}</Td>
                                    <Td className="currency" isCredit={tx.operation === 'C'}>
                                        {tx.operation === 'D' ? '-' : ''}
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.value)}
                                    </Td>
                                    <Td className="actions" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        {tx.operation === 'C' && (
                                            tx.linked_invoice_id ? (
                                                <ActionIcon linked={true} title={`Linked to Invoice ID: ${tx.linked_invoice_id}`}>
                                                    <FaLink />
                                                </ActionIcon>
                                            ) : (
                                                <ActionIcon linked={false} onClick={() => onLinkClick(tx)} title="Link to Invoice">
                                                    <FaUnlink />
                                                </ActionIcon>
                                            )
                                        )}
                                        <FaDownload title="Download Receipt (Not Available)" />
                                    </Td>
                                </Tr>
                            );
                        })}
                    </tbody>
                </Table>
            </TableWrapper>
            <Pagination pagination={pagination} setPagination={setPagination} />
        </>
    );
};

export default AlfaTrustTable;