import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';
import { format, subHours, parse } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const FieldSet = styled.fieldset`
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    padding: 1rem 1.5rem 1.5rem 1.5rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.5rem;
    @media (max-width: 600px) {
        grid-template-columns: 1fr;
    }
`;

const Legend = styled.legend`
    padding: 0 0.5rem;
    margin-left: 0.5rem;
    font-weight: 600;
    color: ${({ theme }) => theme.primary};
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    grid-column: ${({ full }) => full ? '1 / -1' : 'auto'};
`;

const DateTimeContainer = styled.div`
    display: flex;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 500;
    font-size: 0.9rem;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    width: 100%;
`;

const Textarea = styled.textarea`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    min-height: 80px;
    font-family: inherit;
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.primary};
    color: white;
    border: none;
    padding: 0.8rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    align-self: flex-end;
`;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const InvoiceModal = ({ isOpen, onClose, invoice, onSave }) => {
    const isEditMode = !!invoice;
    
    const [formData, setFormData] = useState({});
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    useEffect(() => {
        if (isOpen) {
            let initialDate;
            if (isEditMode && invoice.received_at) {
                // The date from DB is already in GMT-3, treat it as such
                initialDate = new Date(invoice.received_at + "Z");
                initialDate = subHours(initialDate, 3); // Adjust for proper display
            } else {
                // Get current time in São Paulo for new entries
                initialDate = toZonedTime(new Date(), SAO_PAULO_TIMEZONE);
            }

            setDate(format(initialDate, 'yyyy-MM-dd'));
            setTime(format(initialDate, 'HH:mm:ss'));

            setFormData(isEditMode ? { ...invoice } : {
                sender_name: '', recipient_name: '', transaction_id: '',
                pix_key: '', amount: '', credit: '', notes: ''
            });
        }
    }, [invoice, isEditMode, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!date || !time) {
            alert('Date and Time are required.');
            return;
        }

        // Combine date and time strings to create the final timestamp
        const fullTimestamp = `${date} ${time}`;
        
        const payload = {
            ...formData,
            received_at: fullTimestamp,
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
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <h2>{isEditMode ? 'Edit Invoice' : 'Add New Entry'}</h2>
            <Form onSubmit={handleSubmit}>
                <FieldSet>
                    <Legend>Date & Time (GMT-03:00 São Paulo)</Legend>
                    <InputGroup>
                        <Label>Date</Label>
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </InputGroup>
                    <InputGroup>
                        <Label>Time</Label>
                        <Input type="time" step="1" value={time} onChange={(e) => setTime(e.target.value)} />
                    </InputGroup>
                </FieldSet>
                <FieldSet>
                    <Legend>Parties & ID</Legend>
                    <InputGroup>
                        <Label>Sender Name</Label>
                        <Input type="text" name="sender_name" value={formData.sender_name || ''} onChange={handleChange} />
                    </InputGroup>
                    <InputGroup>
                        <Label>Recipient Name</Label>
                        <Input type="text" name="recipient_name" value={formData.recipient_name || ''} onChange={handleChange} />
                    </InputGroup>
                    <InputGroup full>
                        <Label>Transaction ID</Label>
                        <Input type="text" name="transaction_id" value={formData.transaction_id || ''} onChange={handleChange} />
                    </InputGroup>
                </FieldSet>
                <FieldSet>
                    <Legend>Financials</Legend>
                    <InputGroup>
                        <Label>Amount (Debit)</Label>
                        <Input type="text" name="amount" value={formData.amount || ''} onChange={handleChange} placeholder="e.g., 1,250.00" />
                    </InputGroup>
                    <InputGroup>
                        <Label>Credit</Label>
                        <Input type="text" name="credit" value={formData.credit || ''} onChange={handleChange} placeholder="e.g., 50.00" />
                    </InputGroup>
                </FieldSet>
                <FieldSet>
                    <Legend>Additional Info</Legend>
                    <InputGroup>
                        <Label>PIX Key</Label>
                        <Input type="text" name="pix_key" value={formData.pix_key || ''} onChange={handleChange} />
                    </InputGroup>
                    <InputGroup>
                        <Label>Notes</Label>
                        <Textarea name="notes" value={formData.notes || ''} onChange={handleChange} />
                    </InputGroup>
                </FieldSet>
                <Button type="submit">Save Changes</Button>
            </Form>
        </Modal>
    );
};

export default InvoiceModal;