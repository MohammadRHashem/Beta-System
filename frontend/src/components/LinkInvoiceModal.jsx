import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { getCandidateInvoices, confirmManualInvoice } from '../services/api';
import { format } from 'date-fns';

const ListContainer = styled.div`
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
`;

const InvoiceItem = styled.div`
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

const InvoiceInfo = styled.div`
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

const LinkInvoiceModal = ({ isOpen, onClose, transaction }) => {
    const [candidates, setCandidates] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen && transaction) {
            const fetchCandidates = async () => {
                setLoading(true);
                try {
                    const { data } = await getCandidateInvoices(transaction.amount);
                    setCandidates(data);
                } catch (error) {
                    console.error("Failed to fetch candidate invoices:", error);
                    alert("Could not load pending invoices.");
                } finally {
                    setLoading(false);
                }
            };
            fetchCandidates();
        }
    }, [isOpen, transaction]);

    const handleLink = async (invoice) => {
        if (!window.confirm(`Link this ${transaction.source} transaction to the invoice from "${invoice.source_group_name}"?`)) {
            return;
        }
        try {
            await confirmManualInvoice({
                messageId: invoice.message_id,
                linkedTransactionId: transaction.id,
                source: transaction.source
            });
            onClose(); // Close modal on success
        } catch (error) {
            alert(error.response?.data?.message || "Failed to link and confirm invoice.");
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <h2>Link to Pending Invoice</h2>
            <p>
                Select a pending WhatsApp invoice to link with this bank transaction.
                <br />
                <strong>Amount: {transaction?.amount}</strong> | <strong>Source: {transaction?.source}</strong>
            </p>

            <ListContainer>
                {loading ? <p style={{padding: '1rem'}}>Searching for matching invoices...</p> : (
                    candidates.length === 0 ? (
                        <p style={{padding: '1rem', textAlign: 'center'}}>No pending invoices found for this amount.</p>
                    ) : (
                        candidates.map(inv => (
                            <InvoiceItem key={inv.id} onClick={() => handleLink(inv)}>
                                <InvoiceInfo>
                                    <p><strong>{inv.source_group_name}</strong> ({inv.sender_name})</p>
                                    <small>{format(new Date(inv.received_at), 'dd/MM/yyyy HH:mm')}</small>
                                </InvoiceInfo>
                                <LinkButton>Link & Confirm</LinkButton>
                            </InvoiceItem>
                        ))
                    )
                )}
            </ListContainer>
        </Modal>
    );
};

export default LinkInvoiceModal;