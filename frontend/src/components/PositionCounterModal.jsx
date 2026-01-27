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

const GroupList = styled.div`
  max-height: 160px;
  overflow: auto;
  border: 1px solid #eee;
  border-radius: 4px;
  padding: 0.5rem;
  display: grid;
  gap: 0.35rem;
`;

const Select = styled.select`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
    background: #fff;
`;

const PositionCounterModal = ({ isOpen, onClose, onSave, editingCounter, crossSubaccounts, whatsappGroups }) => {
    const isEditMode = !!editingCounter;
    const [name, setName] = useState('');
    const [type, setType] = useState('local');
    const [keyword, setKeyword] = useState('');
    const [subType, setSubType] = useState('alfa');
    const [localMode, setLocalMode] = useState('keyword');
    const [crossVariant, setCrossVariant] = useState('all');
    const [subaccountId, setSubaccountId] = useState('');
    const [excludedPixKeys, setExcludedPixKeys] = useState('');
    const [excludedSourceGroups, setExcludedSourceGroups] = useState([]);
    const [groupSearch, setGroupSearch] = useState('');

    useEffect(() => {
        if (isOpen) {
            setName(isEditMode ? editingCounter.name : '');
            setType(isEditMode ? editingCounter.type : 'local');
            setKeyword(isEditMode ? editingCounter.keyword : '');
            setSubType(isEditMode ? editingCounter.sub_type : 'alfa');
            setLocalMode(isEditMode ? (editingCounter.local_mode || 'keyword') : 'keyword');
            setCrossVariant(isEditMode ? (editingCounter.cross_variant || 'all') : 'all');
            setSubaccountId(isEditMode ? (editingCounter.subaccount_id || '') : '');
            const excluded = isEditMode
                ? (Array.isArray(editingCounter.excluded_pix_keys)
                    ? editingCounter.excluded_pix_keys
                    : (editingCounter.excluded_pix_keys ? JSON.parse(editingCounter.excluded_pix_keys) : []))
                : [];
            setExcludedPixKeys(excluded.join(', '));
            const excludedGroups = isEditMode
                ? (Array.isArray(editingCounter.excluded_source_group_jids)
                    ? editingCounter.excluded_source_group_jids
                    : (editingCounter.excluded_source_group_jids ? JSON.parse(editingCounter.excluded_source_group_jids) : []))
                : [];
            setExcludedSourceGroups(excludedGroups);
            setGroupSearch('');
        }
    }, [isOpen, editingCounter, isEditMode]);

    const filteredGroups = (whatsappGroups || []).filter((group) => {
        if (!groupSearch.trim()) return true;
        const needle = groupSearch.trim().toLowerCase();
        return (group.name || '').toLowerCase().includes(needle) || (group.id || '').toLowerCase().includes(needle);
    });

    const handleSubmit = (e) => {
        e.preventDefault();
        const payload = { name, type };
        if (type === 'local') {
            payload.local_mode = localMode;
            if (localMode === 'cross') {
                payload.cross_variant = crossVariant;
                if (crossVariant === 'geral') {
                    payload.keyword = keyword;
                    payload.excluded_source_group_jids = excludedSourceGroups;
                } else if (crossVariant !== 'all') {
                    payload.subaccount_id = subaccountId;
                } else {
                    payload.excluded_pix_keys = excludedPixKeys
                        .split(',')
                        .map((key) => key.trim())
                        .filter(Boolean);
                }
            } else {
                payload.keyword = keyword;
            }
        } else {
            payload.sub_type = subType;
            if (subType === 'cross') {
                payload.subaccount_id = subaccountId;
            }
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
                    <>
                        <Fieldset>
                            <Legend>Local Source</Legend>
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                <label><input type="radio" value="keyword" checked={localMode === 'keyword'} onChange={(e) => setLocalMode(e.target.value)} /> Keyword (Invoices)</label>
                                <label><input type="radio" value="cross" checked={localMode === 'cross'} onChange={(e) => setLocalMode(e.target.value)} /> Cross (Subaccounts)</label>
                            </div>
                        </Fieldset>

                        {localMode === 'keyword' && (
                            <InputGroup>
                                <Label>Recipient Keyword</Label>
                                <Input type="text" placeholder="e.g., trkbit" value={keyword} onChange={(e) => setKeyword(e.target.value)} required />
                            </InputGroup>
                        )}

                        {localMode === 'cross' && (
                            <>
                                <Fieldset>
                                    <Legend>Cross Counter Type</Legend>
                                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                                        <label><input type="radio" value="all" checked={crossVariant === 'all'} onChange={(e) => setCrossVariant(e.target.value)} /> All Cross</label>
                                        <label><input type="radio" value="geral" checked={crossVariant === 'geral'} onChange={(e) => setCrossVariant(e.target.value)} /> Cross Geral</label>
                                        <label><input type="radio" value="chave" checked={crossVariant === 'chave'} onChange={(e) => setCrossVariant(e.target.value)} /> Cross Chave</label>
                                    </div>
                                </Fieldset>

                                {crossVariant === 'geral' && (
                                    <>
                                        <InputGroup>
                                            <Label>Recipient Keyword</Label>
                                            <Input type="text" placeholder="e.g., cross" value={keyword} onChange={(e) => setKeyword(e.target.value)} required />
                                        </InputGroup>
                                        <InputGroup>
                                            <Label>Exclude Source Groups</Label>
                                            <Input
                                                type="text"
                                                placeholder="Search groups..."
                                                value={groupSearch}
                                                onChange={(e) => setGroupSearch(e.target.value)}
                                            />
                                            <GroupList>
                                                {filteredGroups.map((group) => (
                                                    <label key={group.id}>
                                                        <input
                                                            type="checkbox"
                                                            checked={excludedSourceGroups.includes(group.id)}
                                                            onChange={(e) => {
                                                                const isChecked = e.target.checked;
                                                                setExcludedSourceGroups((prev) => (
                                                                    isChecked
                                                                        ? [...prev, group.id]
                                                                        : prev.filter((jid) => jid !== group.id)
                                                                ));
                                                            }}
                                                        />{' '}
                                                        {group.name || group.id}
                                                    </label>
                                                ))}
                                                {(!whatsappGroups || whatsappGroups.length === 0) && (
                                                    <span style={{ color: '#999' }}>No groups available.</span>
                                                )}
                                                {(whatsappGroups && whatsappGroups.length > 0 && filteredGroups.length === 0) && (
                                                    <span style={{ color: '#999' }}>No matching groups.</span>
                                                )}
                                            </GroupList>
                                        </InputGroup>
                                    </>
                                )}

                                {crossVariant === 'chave' && (
                                    <InputGroup>
                                        <Label>Cross Subaccount</Label>
                                        <Select value={subaccountId} onChange={(e) => setSubaccountId(e.target.value)} required>
                                            <option value="">Select subaccount</option>
                                            {(crossSubaccounts || []).map((account) => (
                                                <option key={account.id} value={account.id}>
                                                    {account.name} {account.chave_pix ? `(${account.chave_pix})` : ''}
                                                </option>
                                            ))}
                                        </Select>
                                    </InputGroup>
                                )}
                                {crossVariant === 'all' && (
                                    <InputGroup>
                                        <Label>Exclude Pix Keys (comma-separated)</Label>
                                        <Input
                                            type="text"
                                            placeholder="e.g., key1@cross-otc.com, key2@cross-otc.com"
                                            value={excludedPixKeys}
                                            onChange={(e) => setExcludedPixKeys(e.target.value)}
                                        />
                                    </InputGroup>
                                )}
                            </>
                        )}
                    </>
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
                        {subType === 'cross' && (
                            <InputGroup style={{ marginTop: '0.5rem' }}>
                                <Label>Cross Subaccount</Label>
                                <Select value={subaccountId} onChange={(e) => setSubaccountId(e.target.value)} required>
                                    <option value="">Select subaccount</option>
                                    {(crossSubaccounts || []).map((account) => (
                                        <option key={account.id} value={account.id}>
                                            {account.name} {account.chave_pix ? `(${account.chave_pix})` : ''}
                                        </option>
                                    ))}
                                </Select>
                            </InputGroup>
                        )}
                    </Fieldset>
                )}

                <Button type="submit">{isEditMode ? 'Save Changes' : 'Create Counter'}</Button>
            </Form>
        </Modal>
    );
};

export default PositionCounterModal;
