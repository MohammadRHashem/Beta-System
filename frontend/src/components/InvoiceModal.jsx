import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice, updateInvoice } from '../services/api';
import { format, toZonedTime } from 'date-fns-tz';
import ComboBox from './ComboBox'; // Import ComboBox

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

const CheckboxContainer = styled.div`
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 0.75rem;
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
    width: 18px;
    height: 18px;
`;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const InvoiceModal = ({ isOpen, onClose, invoice, onSave, allGroups }) => {
    const isEditMode = !!invoice;
    
    const [formData, setFormData] = useState({});
    const [date, setDate] = useState('');
    const [time, setTime] = useState('');

    useEffect(() => {
        if (isOpen) {
            let initialDate;
            if (isEditMode && invoice.received_at) {
                // The date string from the DB is already the correct local time
                initialDate = new Date(invoice.received_at);
            } else {
                // Get current time in São Paulo for new entries
                initialDate = toZonedTime(new Date(), SAO_PAULO_TIMEZONE);
            }

            setDate(format(initialDate, 'yyyy-MM-dd'));
            setTime(format(initialDate, 'HH:mm:ss'));

            setFormData(isEditMode ? { ...invoice } : {
                sender_name: '', recipient_name: '', transaction_id: '',
                pix_key: '', amount: '', notes: '', is_deleted: false,
                source_group_jid: '' // Initialize source group
            });
        }
    }, [invoice, isEditMode, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!date || !time) {
            alert('Date and Time are required.');
            return;
        }

        const fullTimestamp = `${date} ${time}`;
        
        const payload = { ...formData, received_at: fullTimestamp };

        try {
            if (isEditMode) {
                await updateInvoice(invoice.id, payload);
            } else {
                await createInvoice(payload);
            }
            // Ensure onSave handles the state refresh cleanly
            onSave(); 
        } catch (error) {
            // Improved error alerting
            const msg = error.response?.data?.message || 'Failed to save invoice.';
            alert(`Error: ${msg}`);
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
                    
                    {/* === NEW: Source Group Selector === */}
                    <InputGroup full>
                        <Label>Source Group</Label>
                        <ComboBox 
                            options={allGroups || []}
                            value={formData.source_group_jid || ''}
                            onChange={(e) => handleChange({ target: { name: 'source_group_jid', value: e.target.value } })}
                            placeholder="Select a source group (optional)..."
                        />
                    </InputGroup>

                    <InputGroup full>
                        <Label>Transaction ID</Label>
                        <Input type="text" name="transaction_id" value={formData.transaction_id || ''} onChange={handleChange} />
                    </InputGroup>
                </FieldSet>
                <FieldSet>
                    <Legend>Financials & Status</Legend>
                    <InputGroup>
                        <Label>Amount</Label>
                        <Input type="text" name="amount" value={formData.amount || ''} onChange={handleChange} placeholder="e.g., 1,250.00" />
                    </InputGroup>
                     <CheckboxContainer>
                        <Checkbox name="is_deleted" checked={!!formData.is_deleted} onChange={handleChange} />
                        <Label>Mark as Deleted</Label>
                    </CheckboxContainer>
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