import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem; /* Increased gap between fieldsets */
`;

const FieldSet = styled.fieldset`
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    padding: 1rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;

    /* Responsive layout for smaller screens */
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
    display: grid;
    grid-template-columns: repeat(3, 1fr);
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
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
`;

const InvoiceModal = ({ isOpen, onClose, invoice, invoices, insertAtIndex, onSave }) => {
    const isEditMode = !!invoice;
    const isInsertMode = insertAtIndex !== null;
    
    const [formData, setFormData] = useState({});
    const [dateTime, setDateTime] = useState({
        year: '', month: '', day: '', hour: '', minute: '', second: ''
    });

    useEffect(() => {
        if (isOpen) {
            let initialDate;

            if (isEditMode) {
                initialDate = new Date(invoice.received_at);
            } else if (isInsertMode) {
                const prevInvoice = invoices[insertAtIndex - 1];
                const nextInvoice = invoices[insertAtIndex];
                const startTime = prevInvoice ? new Date(prevInvoice.received_at).getTime() : new Date().getTime() - 60000;
                const endTime = nextInvoice ? new Date(nextInvoice.received_at).getTime() : new Date().getTime();
                initialDate = new Date(startTime + (endTime - startTime) / 2);
            } else {
                initialDate = new Date();
            }

            const pad = (num) => num.toString().padStart(2, '0');
            setDateTime({
                year: initialDate.getFullYear().toString(),
                month: pad(initialDate.getMonth() + 1),
                day: pad(initialDate.getDate()),
                hour: pad(initialDate.getHours()),
                minute: pad(initialDate.getMinutes()),
                second: pad(initialDate.getSeconds())
            });

            setFormData(isEditMode ? invoice : {
                sender_name: '', recipient_name: '', transaction_id: '',
                pix_key: '', amount: '0.00', credit: '0.00', notes: ''
            });
        }
    }, [invoice, invoices, insertAtIndex, isEditMode, isInsertMode, isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleDateTimeChange = (e) => {
        setDateTime({ ...dateTime, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const fullTimestamp = `${dateTime.year}-${dateTime.month}-${dateTime.day} ${dateTime.hour}:${dateTime.minute}:${dateTime.second}`;
        
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
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>{isEditMode ? 'Edit Invoice' : 'Add New Entry'}</h2>
            <Form onSubmit={handleSubmit}>

                <FieldSet>
                    <Legend>Date</Legend>
                    <DateTimeContainer>
                        <Input type="number" name="day" placeholder="DD" value={dateTime.day} onChange={handleDateTimeChange} />
                        <Input type="number" name="month" placeholder="MM" value={dateTime.month} onChange={handleDateTimeChange} />
                        <Input type="number" name="year" placeholder="YYYY" value={dateTime.year} onChange={handleDateTimeChange} />
                    </DateTimeContainer>
                </FieldSet>

                <FieldSet>
                    <Legend>Time</Legend>
                    <DateTimeContainer>
                        <Input type="number" name="hour" placeholder="HH" value={dateTime.hour} onChange={handleDateTimeChange} />
                        <Input type="number" name="minute" placeholder="MM" value={dateTime.minute} onChange={handleDateTimeChange} />
                        <Input type="number" name="second" placeholder="SS" value={dateTime.second} onChange={handleDateTimeChange} />
                    </DateTimeContainer>
                </FieldSet>

                <FieldSet>
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