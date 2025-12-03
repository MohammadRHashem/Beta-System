import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import Modal from './Modal';

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 500;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
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
    align-self: center;
    width: 100%;
`;

const Fieldset = styled.fieldset`
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const Legend = styled.legend`
  padding: 0 0.5em;
  font-weight: 500;
  color: ${({ theme }) => theme.lightText};
`;

const PositionCounterModal = ({ isOpen, onClose, onSave, editingCounter }) => {
    const isEditMode = !!editingCounter;
    const [name, setName] = useState('');
    const [type, setType] = useState('local');
    const [keyword, setKeyword] = useState('');
    const [subType, setSubType] = useState('alfa');

    useEffect(() => {
        if (isOpen) {
            setName(isEditMode ? editingCounter.name : '');
            setType(isEditMode ? editingCounter.type : 'local');
            setKeyword(isEditMode ? editingCounter.keyword : '');
            setSubType(isEditMode ? editingCounter.sub_type : 'alfa');
        }
    }, [isOpen, editingCounter, isEditMode]);

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { name, type };
        if (type === 'local') {
            payload.keyword = keyword;
        } else {
            payload.sub_type = subType;
        }
        onSave(payload);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <h2>{isEditMode ? 'Edit Position Counter' : 'Create New Counter'}</h2>
            <Form onSubmit={handleSubmit}>
                <InputGroup>
                    <Label>Counter Name</Label>
                    <Input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                </InputGroup>

                <Fieldset>
                    <Legend>Counter Type</Legend>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <label><input type="radio" value="local" checked={type === 'local'} onChange={(e) => setType(e.target.value)} /> Local (from DB)</label>
                        <label><input type="radio" value="remote" checked={type === 'remote'} onChange={(e) => setType(e.target.value)} /> Remote (from API)</label>
                    </div>
                </Fieldset>
                
                {type === 'local' && (
                    <InputGroup>
                        <Label>Recipient Keyword</Label>
                        <Input type="text" placeholder="e.g., trkbit" value={keyword} onChange={(e) => setKeyword(e.target.value)} required />
                    </InputGroup>
                )}

                {type === 'remote' && (
                    <Fieldset>
                        <Legend>Remote Source</Legend>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <label>
                                <input type="radio" value="alfa" checked={subType === 'alfa'} onChange={(e) => setSubType(e.target.value)} /> 
                                Alfa (Live Balance)
                            </label>
                            
                            {/* === NEW OPTION === */}
                            <label>
                                <input type="radio" value="cross" checked={subType === 'cross'} onChange={(e) => setSubType(e.target.value)} /> 
                                Cross / Trkbit (Daily Net: In - Out)
                            </label>

                            <label style={{ color: '#aaa' }}>
                                <input type="radio" value="troca" disabled /> 
                                Troca (Not Available)
                            </label>
                        </div>
                    </Fieldset>
                )}

                <Button type="submit">{isEditMode ? 'Save Changes' : 'Create Counter'}</Button>
            </Form>
        </Modal>
    );
};

export default PositionCounterModal;