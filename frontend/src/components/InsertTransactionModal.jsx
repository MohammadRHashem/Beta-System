import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';
import { createInvoice } from '../services/api';

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const FieldSet = styled.fieldset`
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    padding: 0.85rem 1rem 1rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;

    @media (max-width: 760px) {
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

const Label = styled.label`
    font-weight: 500;
    font-size: 0.9rem;
`;

const Input = styled.input`
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    width: 100%;
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.primary};
    color: white;
    border: none;
    padding: 0.72rem 0.95rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    font-size: 0.95rem;
    align-self: flex-end;
`;

const InsertTransactionModal = ({ isOpen, onClose, insertAfterId, onSave }) => {
    const [formData, setFormData] = useState({
        sender_name: '', recipient_name: '', amount: '', credit: ''
    });

    useEffect(() => {
        if (isOpen) {
            setFormData({
                sender_name: '', recipient_name: '', amount: '', credit: ''
            });
        }
    }, [isOpen]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        const payload = {
            ...formData,
            insertAfterId: insertAfterId,
            amount: formData.amount || '0.00',
            credit: formData.credit || '0.00',
        };

        try {
            await createInvoice(payload);
            onSave(); 
        } catch (error) {
            alert(`Error: ${error.response?.data?.message || 'Failed to insert transaction.'}`);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} maxWidth="700px">
            <h2>Insert Transaction</h2>
            <Form onSubmit={handleSubmit}>
                <FieldSet>
                    <Legend>Parties</Legend>
                    <InputGroup>
                        <Label>Sender Name</Label>
                        <Input type="text" name="sender_name" value={formData.sender_name} onChange={handleChange} />
                    </InputGroup>
                    <InputGroup>
                        <Label>Recipient Name</Label>
                        <Input type="text" name="recipient_name" value={formData.recipient_name} onChange={handleChange} />
                    </InputGroup>
                </FieldSet>

                <FieldSet>
                    <Legend>Financials</Legend>
                    <InputGroup>
                        <Label>Amount (Debit)</Label>
                        <Input type="text" name="amount" value={formData.amount} onChange={handleChange} placeholder="e.g., 1,250.00" />
                    </InputGroup>
                    <InputGroup>
                        <Label>Credit</Label>
                        <Input type="text" name="credit" value={formData.credit} onChange={handleChange} placeholder="e.g., 50.00" />
                    </InputGroup>
                </FieldSet>
                
                <Button type="submit">Insert Transaction</Button>
            </Form>
        </Modal>
    );
};

export default InsertTransactionModal;
