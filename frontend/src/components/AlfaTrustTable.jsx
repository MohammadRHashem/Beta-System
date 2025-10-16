import React from 'react';
import styled, { css } from 'styled-components';
import { FaDownload } from 'react-icons/fa';
import Pagination from './Pagination';

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    overflow-x: auto;
    border: 1px solid ${({ theme }) => theme.border};
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
            // Correctly handle the MySQL DATETIME format
            return new Date(isoString).toLocaleString('pt-BR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch (e) {
            return isoString;
        }
    };
    
    const handleDownloadReceipt = (tx) => {
        alert(`Receipt download for individual transactions is not yet implemented.`);
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
                            <Th>Transaction ID (endToEndId)</Th>
                            <Th>Sender/Recipient Name</Th>
                            <Th className="currency" style={{color: '#32325D'}}>Amount</Th>
                            <Th>Actions</Th>
                        </tr>
                    </Thead>
                    <tbody>
                        {transactions.map((tx) => (
                            // === THE FIX: Use the correct field names from the database ===
                            <Tr key={tx.id}>
                                <Td>{formatDateTime(tx.inclusion_date)}</Td>
                                <Td>{tx.end_to_end_id || 'N/A'}</Td>
                                <Td>{tx.payer_name || tx.title || 'N/A'}</Td>
                                <Td className="currency" isCredit={tx.operation === 'C'}>
                                    {tx.operation === 'D' ? '-' : ''}
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.value)}
                                </Td>
                                <Td className="actions">
                                    <FaDownload onClick={() => handleDownloadReceipt(tx)} title="Download Receipt (Not Available)" />
                                </Td>
                            </Tr>
                            // === END FIX ===
                        ))}
                    </tbody>
                </Table>
            </TableWrapper>
            <Pagination pagination={pagination} setPagination={setPagination} />
        </>
    );
};

export default AlfaTrustTable;