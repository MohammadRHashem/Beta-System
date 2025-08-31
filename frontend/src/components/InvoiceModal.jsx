import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';

// ... (All styled components are unchanged)

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
            let datePartsFound = false;

            if (isEditMode) {
                if (invoice && invoice.received_at && typeof invoice.received_at === 'string') {
                    const dateTimeParts = invoice.received_at.split(' ');
                    if (dateTimeParts.length === 2) {
                        const datePart = dateTimeParts[0];
                        const timePart = dateTimeParts[1];
                        const [year, month, day] = datePart.split('-');
                        const [hour, minute, second] = timePart.split(':');
                        if (year && month && day && hour && minute && second) {
                            setDateTime({ year, month, day, hour, minute, second });
                            datePartsFound = true;
                        }
                    }
                }
            }
            
            if (!datePartsFound) {
                if (isInsertMode) {
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
        
        let calculated_sort_order;
        if (isInsertMode) {
            const prevInvoice = invoices[insertAtIndex - 1];
            const nextInvoice = invoices[insertAtIndex];
            
            // If inserting at the very beginning, create a sort_order before the first item.
            const prevSort = prevInvoice ? parseFloat(prevInvoice.sort_order) : (nextInvoice ? parseFloat(nextInvoice.sort_order) - 1 : new Date().getTime() / 1000);
            // If inserting at the very end, create a sort_order after the last item.
            const nextSort = nextInvoice ? parseFloat(nextInvoice.sort_order) : (prevInvoice ? parseFloat(prevInvoice.sort_order) + 1 : new Date().getTime() / 1000);
            
            calculated_sort_order = prevSort + (nextSort - prevSort) / 2;
        }
        
        const payload = {
            ...formData,
            received_at: fullTimestamp,
            amount: formData.amount === '' ? '0.00' : formData.amount,
            credit: formData.credit === '' ? '0.00' : formData.credit,
        };

        if (calculated_sort_order !== undefined) {
            payload.sort_order = calculated_sort_order.toFixed(4);
        }

        try {
            if (isEditMode) {
                delete payload.sort_order;
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
        </Modal>
    );
};

export default InvoiceModal;