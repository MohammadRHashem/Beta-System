import React, { useMemo, useState, useEffect } from 'react';
import styled, { css } from 'styled-components';
import { viewInvoiceMedia, deleteInvoice } from '../services/api';
import { FaEdit, FaTrashAlt, FaEye } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';

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
    border-radius: 8px 8px 0 0; /* Rounded corners only on top */
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
    border: 1px solid ${({ theme }) => theme.border};
    background-color: ${({ disabled }) => disabled ? '#f8f9fa' : 'white'};
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    border-radius: 4px;
    font-weight: 600;
    &:hover:not(:disabled) {
        background-color: ${({ theme }) => theme.background};
    }
`;

// === NEW STYLES for the page input ===
const PageControls = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const PageInputForm = styled.form`
    margin: 0 0.5rem;
`;

const PageInput = styled.input`
    width: 50px;
    text-align: center;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid ${({ theme }) => theme.border};
    font-weight: 600;
    -moz-appearance: textfield; /* Firefox */
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
        -webkit-appearance: none;
        margin: 0;
    }
`;


const InvoiceTable = ({ invoices, loading, onEdit, pagination, setPagination }) => {
    // === NEW STATE for the jump-to-page input ===
    const [pageInput, setPageInput] = useState(pagination.currentPage);

    // Keep the input synchronized with the actual page number
    useEffect(() => {
        setPageInput(pagination.currentPage);
    }, [pagination.currentPage]);

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
    
    // === NEW HANDLER for the jump-to-page form ===
    const handlePageInputSubmit = (e) => {
        e.preventDefault();
        const pageNum = parseInt(pageInput, 10);
        if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pagination.totalPages) {
            setPagination(p => ({ ...p, page: pageNum }));
        } else {
            // If input is invalid, reset it to the current page
            setPageInput(pagination.currentPage);
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
                            <Th>Received At (GMT-03:00)</Th>
                            <Th>Transaction ID</Th>
                            <Th>Sender</Th>
                            <Th>Recipient</Th>
                            <Th>Source Group</Th>
                            <Th className="currency">Amount</Th>
                            <Th>Actions</Th>
                        </tr>
                    </thead>
                    <tbody>
                        {invoices.map((inv) => {
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
            
            {/* === UPDATED PAGINATION CONTROLS === */}
            <PaginationContainer>
                <span>Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalRecords} records)</span>
                <PageControls>
                    <PageButton onClick={() => setPagination(p => ({...p, page: p.page - 1}))} disabled={pagination.currentPage <= 1}>
                        Previous
                    </PageButton>

                    <PageInputForm onSubmit={handlePageInputSubmit}>
                        <PageInput 
                            type="number"
                            value={pageInput}
                            onChange={(e) => setPageInput(e.target.value)}
                            onBlur={() => setPageInput(pagination.currentPage)} // Resets if you click away
                        />
                    </PageInputForm>

                    <PageButton onClick={() => setPagination(p => ({...p, page: p.page + 1}))} disabled={pagination.currentPage >= pagination.totalPages}>
                        Next
                    </PageButton>
                </PageControls>
            </PaginationContainer>
        </>
    );
};

export default InvoiceTable;