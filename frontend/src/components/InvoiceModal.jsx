import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';

// --- STYLES ---

// Make the modal content wider for a more professional feel
const WiderModalContent = styled.div`
  background: white;
  padding: 2rem;
  border-radius: 8px;
  width: 90%;
  max-width: 700px; /* Increased max-width */
  position: relative;
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const FieldSet = styled.fieldset`
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    padding: 1rem 1.5rem 1.5rem 1.5rem; /* More vertical padding */
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem 1.5rem; /* Increased gap between columns */

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
    padding: 0.8rem 1.5rem; /* Slightly larger button */
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    font-size: 1rem;
    align-self: flex-end; /* Align to the right */
`;

// --- COMPONENT LOGIC ---

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
                // =================================================================
                // == THE DEFINITIVE BUG FIX IS HERE ==
                // We no longer use `new Date()`. We parse the string manually.
                // The DB string is "YYYY-MM-DD HH:mm:ss"
                const dateTimeParts = invoice.received_at.split(' ');
                const datePart = dateTimeParts[0];
                const timePart = dateTimeParts[1];
                
                const [year, month, day] = datePart.split('-');
                const [hour, minute, second] = timePart.split(':');

                setDateTime({ year, month, day, hour, minute, second });
                // =================================================================

            } else { // Handles both "Insert Between" and "New Entry"
                if (isInsertMode) {
                    const prevInvoice = invoices[insertAtIndex - 1];
                    const nextInvoice = invoices[insertAtIndex];
                    const startTime = prevInvoice ? new Date(prevInvoice.received_at).getTime() : new Date().getTime() - 60000;
                    const endTime = nextInvoice ? new Date(nextInvoice.received_at).getTime() : new Date().getTime();
                    initialDate = new Date(startTime + (endTime - startTime) / 2);
                } else {
                    initialDate = new Date(); // Defaults to current device time, as requested
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
            }

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
        // Use the custom Modal component but pass in our new WiderModalContent
        <Modal isOpen={isOpen} onClose={onClose}>
            <WiderModalContent>
                <h2>{isEditMode ? 'Edit Invoice' : 'Add New Entry'}</h2>
                <Form onSubmit={handleSubmit}>
                    <FieldSet>
                        <Legend>Date & Time (GMT-05:00)</Legend>
                        <DateTimeContainer>
                            <Input type="number" name="day" placeholder="DD" value={dateTime.day} onChange={handleDateTimeChange} />
                            <Input type="number" name="month" placeholder="MM" value={dateTime.month} onChange={handleDateTimeChange} />
                            <Input type="number" name="year" placeholder="YYYY" value={dateTime.year} onChange={handleDateTimeChange} />
                        </DateTimeContainer>
                        <DateTimeContainer>
                            <Input type="number" name="hour" placeholder="HH" value={dateTime.hour} onChange={handleDateTimeChange} />
                            <Input type="number" name="minute" placeholder="MM" value={dateTime.minute} onChange={handleDateTimeChange} />
                            <Input type="number" name="second" placeholder="SS" value={dateTime.second} onChange={handleDateTimeChange} />
                        </DateTimeContainer>
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
            </WiderModalContent>
        </Modal>
    );
};

export default InvoiceModal;