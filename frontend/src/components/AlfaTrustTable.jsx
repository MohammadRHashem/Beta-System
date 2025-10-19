import React from 'react';
import styled, { css } from 'styled-components';
import { FaDownload } from 'react-icons/fa';
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

const AlfaTrustTable = ({ transactions, loading, pagination, setPagination }) => {
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

    if (loading) return <p style={{ textAlign: 'center', padding: '2rem' }}>Loading transactions...</p>;
    if (!transactions || transactions.length === 0) return <p style={{ textAlign: 'center', padding: '2rem' }}>No transactions found for the selected criteria.</p>;

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
                            // === THE DEFINITIVE FIX for N/A values ===
                            let counterpartyName = 'N/A';
                            let transactionId = tx.end_to_end_id || tx.transaction_id || 'N/A';

                            if (tx.operation === 'C') { // Credit (IN)
                                counterpartyName = tx.payer_name || tx.description || 'N/A';
                            } else { // Debit (OUT)
                                try {
                                    // The backend sends the full JSON object now
                                    const details = tx.raw_details; 
                                    counterpartyName = details?.detalhes?.nomeRecebedor || tx.description || 'N/A';
                                } catch (e) {
                                    counterpartyName = tx.description || 'N/A';
                                }
                            }
                            // === END FIX ===

                            return (
                                <Tr key={tx.id}>
                                    <Td>{formatDateTime(tx.inclusion_date)}</Td>
                                    <Td>{transactionId}</Td>
                                    <Td>{counterpartyName}</Td>
                                    <Td className="currency" isCredit={tx.operation === 'C'}>
                                        {tx.operation === 'D' ? '-' : ''}
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.value)}
                                    </Td>
                                    <Td className="actions">
                                        <FaDownload onClick={() => handleDownloadReceipt(tx)} title="Download Receipt (Not Available)" />
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