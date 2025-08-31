import React, { useMemo } from 'react';
import styled, { css } from 'styled-components';
import { viewInvoiceMedia, deleteInvoice } from '../services/api';
import { FaEdit, FaTrashAlt, FaEye, FaPlus } from 'react-icons/fa';

const formatDisplayDateTime = (dbDateString) => {
    if (!dbDateString) return '';
    try {
        const date = new Date(dbDateString);
        const pad = (num) => num.toString().padStart(2, '0');
        const day = pad(date.getDate());
        const month = pad(date.getMonth() + 1);
        const year = date.getFullYear();
        const hours = pad(date.getHours());
        const minutes = pad(date.getMinutes());
        const seconds = pad(date.getSeconds());
        return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
    } catch (e) {
        return 'Invalid Date String';
    }
};

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    overflow-x: auto;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
`;

const Th = styled.th`
    padding: 0.8rem 1rem;
    text-align: left;
    background-color: ${({ theme }) => theme.background};
    font-weight: 600;
    white-space: nowrap;
`;

const Tr = styled.tr`
    position: relative;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    transition: background-color 0.3s ease;
    &:last-child {
        border-bottom: none;
    }
    ${({ isDuplicate }) => isDuplicate && css`
        background-color: #fff0f0;
    `}
    ${({ isDeleted }) => isDeleted && css`
        background-color: #e9ecef !important;
        color: #6c757d;
        text-decoration: line-through;
        .actions svg, .actions a {
            color: #adb5bd;
            cursor: not-allowed;
        }
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
        svg, a {
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

const AddBetweenButton = styled.button`
    position: absolute;
    left: -20px;
    top: 50%;
    transform: translateY(-50%);
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: 2px solid white;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s ease;
    z-index: 5;
    ${Tr}:hover & {
        opacity: 1;
    }
`;

const PaginationContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem;
    background: #fff;
    border-top: 1px solid ${({ theme }) => theme.border};
    border-radius: 0 0 8px 8px;
`;

const PageButton = styled.button`
    padding: 0.5rem 1rem;
    margin: 0 0.25rem;
    border: 1px solid ${({ theme }) => theme.border};
    background-color: ${({ disabled }) => disabled ? '#f8f9fa' : 'white'};
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    border-radius: 4px;
    &:hover:not(:disabled) {
        background-color: ${({ theme }) => theme.background};
    }
`;

const InvoiceTable = ({ invoices, loading, onInsert, onEdit, pagination, setPagination }) => {

    const transactionIdCounts = useMemo(() => {
        const counts = {};
        invoices.forEach(inv => {
            if (inv.transaction_id && !inv.is_manual) {
                counts[inv.transaction_id] = (counts[inv.transaction_id] || 0) + 1;
            }
        });
        return counts;
    }, [invoices]);

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to permanently delete this invoice? This action cannot be undone.')) {
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
    if (!invoices.length) return <p>No invoices found for the selected criteria.</p>;

    return (
        <>
        <TableWrapper>
            <Table>
                <thead>
                    <tr>
                        <Th style={{paddingLeft: '30px'}}>Received At (GMT-05:00)</Th>
                        <Th>Transaction ID</Th>
                        <Th>Sender</Th>
                        <Th>Recipient</Th>
                        <Th>Source Group</Th>
                        <Th className="currency">Amount (Debit)</Th>
                        <Th className="currency">Credit</Th>
                        <Th className="currency">Balance</Th>
                        <Th>Actions</Th>
                    </tr>
                </thead>
                <tbody>
                    {invoices.map((inv, index) => {
                        const isDuplicate = inv.transaction_id && transactionIdCounts[inv.transaction_id] > 1;
                        const needsReview = !inv.is_manual && (!inv.sender_name || !inv.recipient_name || !inv.amount || inv.amount === '0.00');

                        return (
                            <Tr key={inv.id} isDuplicate={isDuplicate} isDeleted={!!inv.is_deleted}>
                                <Td>
                                    <AddBetweenButton onClick={() => onInsert(index)} title="Insert new entry here">
                                        <FaPlus size={12} />
                                    </AddBetweenButton>
                                    {formatDisplayDateTime(inv.received_at)}
                                </Td>
                                <Td>{inv.transaction_id || ''}</Td>
                                <Td>{inv.sender_name || (needsReview ? 'REVIEW' : '')}</Td>
                                <Td>{inv.recipient_name || (needsReview ? 'REVIEW' : '')}</Td>
                                <Td>{inv.source_group_name || ''}</Td>
                                <Td className={`currency ${needsReview && inv.amount === '0.00' ? 'review' : ''}`}>{inv.amount || ''}</Td>
                                <Td className="currency">{inv.credit || ''}</Td>
                                <Td className="currency">{inv.balance || ''}</Td>
                                <Td className="actions">
                                    {inv.media_path && !inv.is_deleted && <FaEye onClick={() => handleViewMedia(inv.id)} title="View Media" />}
                                    <FaEdit onClick={() => onEdit(inv)} title="Edit" />
                                    {!inv.is_deleted && <FaTrashAlt onClick={() => handleDelete(inv.id)} title="Delete" />}
                                </Td>
                            </Tr>
                        );
                    })}
                </tbody>
            </Table>
        </TableWrapper>
        <PaginationContainer>
            <span>Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalRecords} records)</span>
            <div>
                 <PageButton onClick={() => setPagination(p => ({...p, page: p.page - 1}))} disabled={pagination.currentPage <= 1}>Previous</PageButton>
                 <PageButton onClick={() => setPagination(p => ({...p, page: p.page + 1}))} disabled={pagination.currentPage >= pagination.totalPages}>Next</PageButton>
            </div>
        </PaginationContainer>
        </>
    );
};

export default InvoiceTable;