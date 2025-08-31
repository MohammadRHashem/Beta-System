import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';
// === NEW IMPORTS FOR THE PROFESSIONAL DATE PICKER ===
import DatePicker from 'react-datepicker';

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

    /* Styling for react-datepicker input */
    .react-datepicker-wrapper {
        width: 100%;
    }
    .react-datepicker__input-container input {
        width: 100%;
        padding: 0.75rem;
        border: 1px solid ${({ theme }) => theme.border};
        border-radius: 4px;
        font-family: inherit;
        font-size: 1rem; /* Match other inputs */
    }
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

const InvoiceModal = ({ isOpen, onClose, invoice, invoices, insertAtIndex, onSave }) => {
    const isEditMode = !!invoice;
    const isInsertMode = insertAtIndex !== null;
    
    // The state for the date picker MUST be a native Date object, not a string.
    const [receivedAtDate, setReceivedAtDate] = useState(new Date());
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (isOpen) {
            let initialDate;

            if (isEditMode) {
                // When editing, create a Date object from the invoice's stored timestamp.
                initialDate = new Date(invoice.received_at);
                setFormData(invoice);
            } else if (isInsertMode) {
                const prevInvoice = invoices[insertAtIndex - 1];
                const nextInvoice = invoices[insertAtIndex];
                const startTime = prevInvoice ? new Date(prevInvoice.received_at).getTime() : new Date().getTime() - 60000;
                const endTime = nextInvoice ? new Date(nextInvoice.received_at).getTime() : new Date().getTime();
                initialDate = new Date(startTime + (endTime - startTime) / 2);
                setFormData({
                    sender_name: '', recipient_name: '', transaction_id: '',
                    pix_key: '', amount: '0.00', credit: '0.00', notes: ''
                });
            } else {
                // For a new entry, default to the current time.
                initialDate = new Date();
                setFormData({
                    sender_name: '', recipient_name: '', transaction_id: '',
                    pix_key: '', amount: '0.00', credit: '0.00', notes: ''
                });
            }
            setReceivedAtDate(initialDate);
        }
    }, [invoice, invoices, insertAtIndex, isEditMode, isInsertMode, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Convert the Date object back to an ISO string, which the backend's `new Date()` can parse perfectly.
        const payload = {
            ...formData,
            received_at: receivedAtDate.toISOString(),
            amount: formData.amount === '' ? '0.00' : formData.amount,
            credit: formData.credit === '' ? '0.00' : formData.credit,
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
            <h2>{isEditMode ? 'Edit Invoice' : 'Add New Entry'}</h2>
            <Form onSubmit={handleSubmit}>
                <InputGroup full>
                    <Label>Received At (GMT-05:00)</Label>
                    {/* === THE NEW, PROFESSIONAL DATE PICKER === */}
                    <DatePicker
                        selected={receivedAtDate}
                        onChange={(date) => setReceivedAtDate(date)}
                        showTimeSelect
                        timeFormat="HH:mm:ss"
                        timeIntervals={15} // For the minute dropdown
                        timeCaption="Time"
                        dateFormat="dd/MM/yyyy HH:mm:ss" // How the date is displayed in the input
                        required
                    />
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
                    <Input type="text" name="amount" value={formData.amount || ''} onChange={handleChange} placeholder="e.g., 1,250.00" />
                </InputGroup>
                <InputGroup>
                    <Label>Credit</Label>
                    <Input type="text" name="credit" value={formData.credit || ''} onChange={handleChange} placeholder="e.g., 50.00" />
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