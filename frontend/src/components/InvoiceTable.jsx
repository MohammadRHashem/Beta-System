import React, { useMemo } from 'react';
import styled, { css } from 'styled-components';
import { viewInvoiceMedia, deleteInvoice } from '../services/api';
import { FaEdit, FaTrashAlt, FaEye } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';
import Pagination from './Pagination';

const formatDisplayDateTime = (dbDateString) => {
    if (!dbDateString || typeof dbDateString !== 'string') return '';
    try {
        const utcDate = new Date(dbDateString + 'Z');
        return formatInTimeZone(utcDate, 'America/Sao_Paulo', 'dd/MM/yyyy HH:mm:ss');
    } catch (e) {
        console.warn("Could not format date string:", dbDateString);
        return dbDateString;
    }
};

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    max-height: 70vh; 
    overflow-y: auto;
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
    position: relative;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    transition: background-color 0.3s ease;
    &:last-child {
        border-bottom: none;
    }
    &:hover {
        background-color: #f6f9fc;
    }
    ${({ isDuplicate }) => isDuplicate && css`
        background-color: #fff0f0;
    `}
    ${({ isDeleted }) => isDeleted && css`
        background-color: #e9ecef !important;
        color: #6c757d;
        text-decoration: line-through;
    `}
`;

const Td = styled.td`
    padding: 0.8rem 1rem;
    vertical-align: middle;
    &.actions {
        display: flex;
        gap: 1.2rem;
        font-size: 1rem;
        white-space: nowrap;
        svg {
            cursor: pointer;
            color: ${({ theme }) => theme.lightText};
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
    }
    &.currency {
        text-align: right;
        font-family: 'Courier New', Courier, monospace;
        font-weight: 600;
        white-space: nowrap;
    }
    &.review {
        color: ${({ theme }) => theme.error};
        font-weight: bold;
    }
`;

const InvoiceTable = ({ invoices, loading, onEdit, pagination, setPagination }) => {

    // This logic correctly creates a map of transaction IDs to their counts.
    const transactionIdCounts = useMemo(() => {
        const counts = {};
        if (!invoices || !Array.isArray(invoices)) return {}; // Safety check
        invoices.forEach(inv => {
            if (inv.transaction_id && !inv.is_manual) {
                counts[inv.transaction_id] = (counts[inv.transaction_id] || 0) + 1;
            }
        });
        return counts;
    }, [invoices]);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to PERMANENTLY delete this invoice? This action cannot be undone.')) {
            try {
                await deleteInvoice(id);
            } catch (error) {
                alert('Failed to delete invoice.');
            }
        }
    };

    const handleViewMedia = async (id) => {
        try {
            await viewInvoiceMedia(id);
        } catch (error) {
            console.error("Failed to open media:", error);
            alert("Could not load media file. It may have been deleted.");
        }
    };

    if (loading) return <p>Loading invoices...</p>;
    if (!invoices || !invoices.length) return <p>No invoices found for the selected criteria.</p>;

    return (
        <>
            <TableWrapper>
                <Table>
                    <Thead>
                        <tr>
                            <Th>Received At (GMT-03:00)</Th>
                            <Th>Transaction ID</Th>
                            <Th>Sender</Th>
                            <Th>Recipient</Th>
                            <Th>Source Group</Th>
                            <Th className="currency">Amount</Th>
                            <Th>Actions</Th>
                        </tr>
                    </Thead>
                    <tbody>
                        {invoices.map((inv) => {
                            // === THE DEFINITIVE FIX FOR THE CRASH ===
                            // This correctly checks the count from the pre-calculated object.
                            const isDuplicate = inv.transaction_id && transactionIdCounts[inv.transaction_id] > 1;
                            const needsReview = !inv.is_manual && (!inv.sender_name || !inv.recipient_name || !inv.amount || inv.amount === '0.00');

                            return (
                                <Tr key={inv.id} isDuplicate={isDuplicate} isDeleted={!!inv.is_deleted}>
                                    <Td>{formatDisplayDateTime(inv.received_at)}</Td>
                                    <Td>{inv.transaction_id || ''}</Td>
                                    <Td>{inv.sender_name || (needsReview ? 'REVIEW' : '')}</Td>
                                    <Td>{inv.recipient_name || (needsReview ? 'REVIEW' : '')}</Td>
                                    <Td>{inv.source_group_name || ''}</Td>
                                    <Td className={`currency ${needsReview && inv.amount === '0.00' ? 'review' : ''}`}>{inv.amount || ''}</Td>
                                    <Td className="actions">
                                        {inv.media_path && <FaEye onClick={() => handleViewMedia(inv.id)} title="View Media" />}
                                        <FaEdit onClick={() => onEdit(inv)} title="Edit" />
                                        <FaTrashAlt onClick={() => handleDelete(inv.id)} title="Delete Permanently" />
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

export default InvoiceTable;