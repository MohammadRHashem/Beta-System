import React, { useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';
import Modal from './Modal';

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const Intro = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    margin-bottom: 0.3rem;
`;

const IntroText = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    line-height: 1.45;
`;

const Field = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
`;

const Label = styled.label`
    font-weight: 700;
    color: ${({ theme }) => theme.text};
`;

const Input = styled.input`
    padding: 0.78rem 0.82rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
    font-size: 0.96rem;
`;

const Select = styled.select`
    padding: 0.78rem 0.82rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
    font-size: 0.96rem;
`;

const Hint = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.88rem;
    line-height: 1.45;
`;

const Footer = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 0.25rem;
`;

const Button = styled.button`
    padding: 0.72rem 1rem;
    border-radius: 10px;
    border: 1px solid ${({ $ghost, theme }) => ($ghost ? theme.border : 'transparent')};
    background: ${({ $ghost, theme }) => ($ghost ? theme.surface : theme.primary)};
    color: ${({ $ghost, theme }) => ($ghost ? theme.text : 'white')};
    font-weight: 700;
    cursor: pointer;
`;

const EmptyBox = styled.div`
    padding: 0.95rem;
    border-radius: 12px;
    border: 1px dashed ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.lightText};
`;

const Checklist = styled.div`
    max-height: 180px;
    overflow: auto;
    padding: 0.8rem;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    display: grid;
    gap: 0.55rem;
`;

const CheckLabel = styled.label`
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: ${({ theme }) => theme.text};
    font-size: 0.92rem;
`;

const parseIdList = (value) => {
    if (value == null || value === '') return [];
    let raw = value;
    if (!Array.isArray(raw)) {
        try {
            raw = JSON.parse(value);
        } catch (error) {
            return [];
        }
    }
    if (!Array.isArray(raw)) return [];
    return raw.map((entry) => Number.parseInt(entry, 10)).filter((entry) => Number.isInteger(entry) && entry > 0);
};

const PositionCounterModal = ({ isOpen, onClose, onSave, editingCounter, invoiceSubaccounts, crossTransactionSubaccounts }) => {
    const isEditMode = Boolean(editingCounter);
    const [name, setName] = useState('');
    const [subaccountId, setSubaccountId] = useState('');
    const [excludedCrossTransactionSubaccountIds, setExcludedCrossTransactionSubaccountIds] = useState([]);

    useEffect(() => {
        if (!isOpen) return;
        setName(isEditMode ? editingCounter.name || '' : '');
        setSubaccountId(isEditMode ? String(editingCounter.subaccount_id || '') : '');
        setExcludedCrossTransactionSubaccountIds(
            isEditMode ? parseIdList(editingCounter.excluded_cross_transaction_subaccount_ids) : []
        );
    }, [editingCounter, isEditMode, isOpen]);

    const selectedSubaccount = useMemo(
        () => (invoiceSubaccounts || []).find((subaccount) => String(subaccount.id) === String(subaccountId)) || null,
        [invoiceSubaccounts, subaccountId]
    );

    const handleSubmit = (event) => {
        event.preventDefault();
        onSave({
            name: name.trim(),
            subaccount_id: Number.parseInt(subaccountId, 10),
            excluded_cross_transaction_subaccount_ids: excludedCrossTransactionSubaccountIds,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>{isEditMode ? 'Edit Invoice Counter' : 'Add Invoice Counter'}</h2>
            <Form onSubmit={handleSubmit}>
                <Intro>
                    <IntroText>
                        Counters on this page can only point to subaccounts whose portal source is set to <strong>Invoices</strong>.
                    </IntroText>
                    <Hint>
                        The card will read the same portal ledger logic and show the consolidated saldo total until the selected date.
                    </Hint>
                </Intro>

                <Field>
                    <Label>Counter Name</Label>
                    <Input
                        type="text"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="e.g. Kinxt Invoice Position"
                        required
                    />
                </Field>

                <Field>
                    <Label>Invoice Portal Subaccount</Label>
                    <Select
                        value={subaccountId}
                        onChange={(event) => setSubaccountId(event.target.value)}
                        required
                    >
                        <option value="">Select invoice portal subaccount</option>
                        {(invoiceSubaccounts || []).map((subaccount) => (
                            <option key={subaccount.id} value={subaccount.id}>
                                {subaccount.name} ({String(subaccount.account_type || '').toUpperCase()})
                            </option>
                        ))}
                    </Select>
                </Field>

                {selectedSubaccount ? (
                    <Hint>
                        Portal source: <strong>{selectedSubaccount.portal_source_type}</strong>
                        {' '}| Account type: <strong>{selectedSubaccount.account_type}</strong>
                        {selectedSubaccount.invoice_recipient_pattern ? (
                            <>
                                {' '}| Pattern: <strong>{selectedSubaccount.invoice_recipient_pattern}</strong>
                            </>
                        ) : null}
                    </Hint>
                ) : !(invoiceSubaccounts || []).length ? (
                    <EmptyBox>No invoice-based portal subaccounts are available yet.</EmptyBox>
                ) : null}

                {selectedSubaccount?.account_type === 'cross' ? (
                    <Field>
                        <Label>Exclude Cross Transaction Subaccounts</Label>
                        <Hint>
                            This selector affects both the main <strong>Saldo Until Date</strong> and the secondary
                            <strong> Chave Pix Saldo Total</strong>. The counter adds transaction-source Cross
                            subaccount balances except the ones you exclude here.
                        </Hint>
                        {(crossTransactionSubaccounts || []).length ? (
                            <Checklist>
                                {crossTransactionSubaccounts.map((subaccount) => {
                                    const checked = excludedCrossTransactionSubaccountIds.includes(Number(subaccount.id));
                                    return (
                                        <CheckLabel key={subaccount.id}>
                                            <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => {
                                                    const numericId = Number(subaccount.id);
                                                    setExcludedCrossTransactionSubaccountIds((prev) => (
                                                        event.target.checked
                                                            ? [...prev, numericId]
                                                            : prev.filter((entry) => entry !== numericId)
                                                    ));
                                                }}
                                            />
                                            <span>{subaccount.name}</span>
                                        </CheckLabel>
                                    );
                                })}
                            </Checklist>
                        ) : (
                            <EmptyBox>No Cross transaction-source subaccounts are available.</EmptyBox>
                        )}
                    </Field>
                ) : null}

                <Footer>
                    <Button type="button" $ghost onClick={onClose}>Cancel</Button>
                    <Button type="submit">{isEditMode ? 'Save Changes' : 'Create Counter'}</Button>
                </Footer>
            </Form>
        </Modal>
    );
};

export default PositionCounterModal;
