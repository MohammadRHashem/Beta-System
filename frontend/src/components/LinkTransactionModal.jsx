import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { getManualCandidates, confirmManualInvoice } from '../services/api';
import { format } from 'date-fns';
import { FaLink } from 'react-icons/fa';

const ListContainer = styled.div`
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
`;

// === FIX #1: Renamed from InvoiceItem to TransactionItem for clarity and to match usage ===
const TransactionItem = styled.div`
    padding: 1rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;

    &:last-child {
        border-bottom: none;
    }

    &:hover {
        background-color: #f6f9fc;
    }
`;

// === FIX #2: Renamed from InvoiceInfo to TransactionInfo for clarity ===
const TransactionInfo = styled.div`
    p { margin: 0; }
    strong { color: ${({ theme }) => theme.primary}; }
    small { color: #6b7c93; }
`;

const LinkButton = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    font-weight: bold;
    cursor: pointer;
`;

const LinkTransactionModal = ({ isOpen, onClose, invoice }) => {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && invoice) {
            const fetchCandidates = async () => {
                setLoading(true);
                try {
                    const amount = parseFloat(invoice.amount.replace(/,/g, ''));
                    const { data } = await getManualCandidates(amount, invoice.recipient_name);
                    setCandidates(data);
                } catch (error) {
                    console.error("Failed to fetch candidate transactions:", error);
                } finally {
                    setLoading(false);
                }
            };
            fetchCandidates();
        }
    }, [isOpen, invoice]);

    const handleLink = async (transaction) => {
        if (!window.confirm(`Link this invoice to the ${transaction.source} transaction from "${transaction.name}"?`)) {
            return;
        }
        try {
            await confirmManualInvoice({
                messageId: invoice.message_id,
                linkedTransactionId: transaction.id,
                source: transaction.source
            });
            onClose();
        } catch (error) {
            alert(error.response?.data?.message || "Failed to link invoice.");
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="800px">
            <h2>Link to Bank Transaction</h2>
            <p>
                Select an unused bank transaction to link with this invoice.
                <br />
                <strong>Amount: {invoice?.amount}</strong> | <strong>Recipient: {invoice?.recipient_name}</strong>
            </p>
            <ListContainer>
                {loading ? <p>Loading...</p> : (
                    candidates.length === 0 ? (
                        <p style={{padding: '1rem', textAlign: 'center'}}>No unused bank transactions found for this amount.</p>
                    ) : (
                        candidates.map(tx => (
                            <TransactionItem key={`${tx.source}-${tx.id}`}>
                                <TransactionInfo>
                                    <p><strong>{tx.name}</strong> ({tx.source})</p>
                                    <small>{format(new Date(tx.date), 'dd/MM/yyyy HH:mm')}</small>
                                </TransactionInfo>
                                <LinkButton onClick={() => handleLink(tx)}>
                                    <FaLink /> Link
                                </LinkButton>
                            </TransactionItem>
                        ))
                    )
                )}
            </ListContainer>
        </Modal>
    );
};

export default LinkTransactionModal;