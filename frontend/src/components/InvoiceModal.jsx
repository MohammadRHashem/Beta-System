import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';
import { formatUTCToSaoPauloInput, getCurrentSaoPauloForInput } from '../utils/dateFormatter';

const Form = styled.form`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    grid-column: ${({ full }) => full ? '1 / -1' : 'auto'};
`;

const Label = styled.label`
    font-weight: 500;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
`;

const Textarea = styled.textarea`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    min-height: 80px;
    font-family: inherit;
`;

const Button = styled.button`
    grid-column: 1 / -1;
    background-color: ${({ theme }) => theme.primary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
`;

const InvoiceModal = ({ isOpen, onClose, invoice, onSave }) => {
    const isEditMode = !!invoice;
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (isOpen) {
            if (isEditMode) {
                setFormData({ ...invoice, received_at: formatUTCToSaoPauloInput(invoice.received_at) });
            } else {
                setFormData({
                    sender_name: '', recipient_name: '', transaction_id: '',
                    pix_key: '', amount: '', credit: '', notes: '',
                    received_at: getCurrentSaoPauloForInput()
                });
            }
        }
    }, [invoice, isEditMode, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const payload = {
            ...formData,
            amount: formData.amount === '' ? null : formData.amount,
            credit: formData.credit === '' ? null : formData.credit,
        };

        try {
            if (isEditMode) {
                await updateInvoice(invoice.id, payload);
            } else {
                await createInvoice(payload);
            }
            onSave();
        } catch (error) {
            alert(`Error: ${error.response?.data?.message || 'Failed to save invoice.'}`);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>{isEditMode ? 'Edit Invoice' : 'Add Manual Entry'}</h2>
            <Form onSubmit={handleSubmit}>
                <InputGroup>
                    <Label>Received At (São Paulo Time)</Label>
                    <Input type="datetime-local" name="received_at" value={formData.received_at || ''} onChange={handleChange} required />
                </InputGroup>
                <InputGroup>
                    <Label>Transaction ID</Label>
                    <Input type="text" name="transaction_id" value={formData.transaction_id || ''} onChange={handleChange} />
                </InputGroup>
                <InputGroup>
                    <Label>Sender Name</Label>
                    <Input type="text" name="sender_name" value={formData.sender_name || ''} onChange={handleChange} />
                </InputGroup>
                <InputGroup>
                    <Label>Recipient Name</Label>
                    <Input type="text" name="recipient_name" value={formData.recipient_name || ''} onChange={handleChange} />
                </InputGroup>
                <InputGroup>
                    <Label>Amount (Debit)</Label>
                    <Input type="text" name="amount" value={formData.amount || ''} onChange={handleChange} placeholder="e.g., 1,250.50" />
                </InputGroup>
                <InputGroup>
                    <Label>Credit</Label>
                    <Input type="number" step="0.01" name="credit" value={formData.credit || ''} onChange={handleChange} placeholder="e.g., 10.00" />
                </InputGroup>
                <InputGroup full>
                    <Label>PIX Key</Label>
                    <Input type="text" name="pix_key" value={formData.pix_key || ''} onChange={handleChange} />
                </InputGroup>
                <InputGroup full>
                    <Label>Notes</Label>
                    <Textarea name="notes" value={formData.notes || ''} onChange={handleChange} />
                </InputGroup>
                <Button type="submit">Save Changes</Button>
            </Form>
        </Modal>
    );
};

export default InvoiceModal;