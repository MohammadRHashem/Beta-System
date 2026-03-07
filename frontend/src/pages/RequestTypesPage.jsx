import React, { useState, useEffect } from 'react';
import { getRequestTypes, createRequestType, updateRequestType, deleteRequestType } from '../services/api';
import styled from 'styled-components';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext';
import { FaEdit, FaTrash, FaPlus, FaCodeBranch } from 'react-icons/fa';

const PageContainer = styled.div` display: flex; flex-direction: column; gap: 1.25rem; `;
const Card = styled.div` background: #fff; padding: 1.1rem 1.2rem 1rem; border-radius: 14px; border: 1px solid rgba(9, 30, 66, 0.08); box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08); `;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 0.75rem; flex-wrap: wrap; `;
const Title = styled.h2` display: flex; align-items: center; gap: 0.5rem; margin: 0; line-height: 1.2; `;
const Button = styled.button` background-color: ${({ theme }) => theme.secondary}; color: white; border: none; padding: 0.66rem 1rem; border-radius: 8px; cursor: pointer; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; `;
const TableWrapper = styled.div` width: 100%; overflow-x: auto; border: 1px solid ${({ theme }) => theme.border}; border-radius: 10px; `;
const RulesTable = styled.table` width: 100%; min-width: 1080px; border-collapse: collapse; margin-top: 0; font-size: 0.9rem; th, td { padding: 0.78rem 0.85rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; vertical-align: middle; white-space: nowrap; } td:nth-child(4) { white-space: normal; } th { background-color: ${({ theme }) => theme.background}; font-size: 0.84rem; letter-spacing: 0.01em; } td.actions { display: flex; gap: 0.9rem; font-size: 1rem; svg { cursor: pointer; &:hover { color: ${({ theme }) => theme.primary}; } } } `;
const Form = styled.form` display: flex; flex-direction: column; gap: 0.9rem; `;
const InputGroup = styled.div` display: flex; flex-direction: column; gap: 0.5rem; `;
const Label = styled.label` font-weight: 500; color: ${({ theme }) => theme.text}; `;
const Input = styled.input` padding: 0.68rem 0.72rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; font-size: 0.95rem; `;
const ColorInput = styled.input.attrs({ type: 'color' })`
    width: 100%;
    height: 42px;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    cursor: pointer;
`;
const Code = styled.code` background: #eee; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: 'Courier New', Courier, monospace; `;
const ColorPreview = styled.div`
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background-color: ${props => props.color};
    border: 1px solid #ccc;
`;
const FormRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.85rem;

    &.wide {
        grid-template-columns: 1fr 2fr;
    }

    @media (max-width: 760px) {
        grid-template-columns: 1fr;

        &.wide {
            grid-template-columns: 1fr;
        }
    }
`;
const CheckRow = styled(InputGroup)`
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
`;

const normalizeDraft = (type) => ({
    ...type,
    is_enabled: type?.is_enabled ? 1 : 0,
    track_content_history: type?.track_content_history ? 1 : 0,
    content_label: type?.content_label || '',
    new_content_reaction: type?.new_content_reaction || '\uD83C\uDD95',
    new_content_reply_text: type?.new_content_reply_text || 'Request received. Everything is okay. If you need anything, call us.'
});

const RequestTypesPage = () => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('settings:edit_request_triggers');

    const [types, setTypes] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingType, setEditingType] = useState(null);

    const fetchTypes = async () => {
        try {
            const { data } = await getRequestTypes();
            setTypes(data);
        } catch (error) {
            console.error('Failed to fetch request types:', error);
            alert('Failed to fetch request types.');
        }
    };

    useEffect(() => {
        fetchTypes();
    }, []);

    const openEditModal = (type) => {
        setEditingType(normalizeDraft(type));
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        const payload = {
            ...editingType,
            is_enabled: editingType.is_enabled ? 1 : 0,
            track_content_history: editingType.track_content_history ? 1 : 0,
            content_label: (editingType.content_label || '').trim() || null
        };

        try {
            if (editingType.id) {
                await updateRequestType(editingType.id, payload);
            } else {
                await createRequestType(payload);
            }
            fetchTypes();
            setIsModalOpen(false);
        } catch (error) {
            alert('Failed to save request type.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this trigger?')) {
            try {
                await deleteRequestType(id);
                fetchTypes();
            } catch (error) {
                alert('Failed to delete trigger.');
            }
        }
    };

    return (
        <>
            <PageContainer>
                <Card>
                    <Header>
                        <Title><FaCodeBranch /> Client Request Triggers</Title>
                        {canEdit && (
                            <Button onClick={() => openEditModal({
                                name: '',
                                trigger_regex: '',
                                acknowledgement_reaction: '\uD83D\uDD14',
                                new_content_reaction: '\uD83C\uDD95',
                                new_content_reply_text: 'Request received. Everything is okay. If you need anything, call us.',
                                color: '#E0E0E0',
                                is_enabled: 1,
                                track_content_history: 0,
                                content_label: ''
                            })}>
                                <FaPlus /> New Trigger
                            </Button>
                        )}
                    </Header>
                    <p>Configure regular expressions to capture requests from chat. Use history tracking only for types where repeated content matters (for example wallet addresses).</p>
                    <TableWrapper>
                        <RulesTable>
                            <thead>
                                <tr>
                                    <th>Enabled</th>
                                    <th>Color</th>
                                    <th>Name</th>
                                    <th>Trigger Regex</th>
                                    <th>Reaction</th>
                                    <th>New Reaction</th>
                                    <th>Track History</th>
                                    <th>Content Label</th>
                                    {canEdit && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {types.map(type => (
                                    <tr key={type.id}>
                                        <td>{type.is_enabled ? 'Yes' : 'No'}</td>
                                        <td><ColorPreview color={type.color} /></td>
                                        <td>{type.name}</td>
                                        <td><Code>{type.trigger_regex}</Code></td>
                                        <td>{type.acknowledgement_reaction}</td>
                                        <td>{type.new_content_reaction || '\uD83C\uDD95'}</td>
                                        <td>{type.track_content_history ? 'On' : 'Off'}</td>
                                        <td>{type.content_label || '-'}</td>
                                        {canEdit && (
                                            <td className="actions">
                                                <FaEdit onClick={() => openEditModal(type)} title="Edit" />
                                                <FaTrash onClick={() => handleDelete(type.id)} title="Delete" />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </RulesTable>
                    </TableWrapper>
                </Card>
            </PageContainer>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingType && (
                    <Form onSubmit={handleSave}>
                        <h2>{editingType.id ? 'Edit' : 'Create'} Request Trigger</h2>
                        <InputGroup><Label>Name</Label><Input type="text" value={editingType.name} onChange={e => setEditingType({ ...editingType, name: e.target.value })} required /></InputGroup>
                        <InputGroup>
                            <Label>Trigger Regex</Label>
                            <Input type="text" value={editingType.trigger_regex} onChange={e => setEditingType({ ...editingType, trigger_regex: e.target.value })} required />
                            <small>Must contain one capture group <Code>()</Code> for the content. Example: <Code>SWIFT: (\\w+)</Code></small>
                        </InputGroup>
                        <InputGroup>
                            <Label>Content Label (optional)</Label>
                            <Input
                                type="text"
                                value={editingType.content_label || ''}
                                onChange={e => setEditingType({ ...editingType, content_label: e.target.value })}
                                placeholder="Example: USDT Address"
                            />
                        </InputGroup>
                        <FormRow>
                            <InputGroup><Label>Acknowledgement Reaction</Label><Input type="text" value={editingType.acknowledgement_reaction} onChange={e => setEditingType({ ...editingType, acknowledgement_reaction: e.target.value })} /></InputGroup>
                            <InputGroup><Label>Highlight Color</Label><ColorInput value={editingType.color} onChange={e => setEditingType({ ...editingType, color: e.target.value })} /></InputGroup>
                        </FormRow>
                        <FormRow className="wide">
                            <InputGroup>
                                <Label>New Content Reaction</Label>
                                <Input
                                    type="text"
                                    value={editingType.new_content_reaction || ''}
                                    onChange={e => setEditingType({ ...editingType, new_content_reaction: e.target.value })}
                                />
                                <small>Used when tracked content appears with no completed history yet.</small>
                            </InputGroup>
                            <InputGroup>
                                <Label>New Content Reply Text</Label>
                                <Input
                                    type="text"
                                    value={editingType.new_content_reply_text || ''}
                                    onChange={e => setEditingType({ ...editingType, new_content_reply_text: e.target.value })}
                                    placeholder="Request received. Everything is okay. If you need anything, call us."
                                />
                            </InputGroup>
                        </FormRow>
                        <CheckRow>
                            <input
                                type="checkbox"
                                id="track_content_history"
                                checked={!!editingType.track_content_history}
                                onChange={e => setEditingType({ ...editingType, track_content_history: e.target.checked ? 1 : 0 })}
                            />
                            <Label htmlFor="track_content_history">Track history by captured information value</Label>
                        </CheckRow>
                        <CheckRow>
                            <input
                                type="checkbox"
                                id="is_enabled"
                                checked={!!editingType.is_enabled}
                                onChange={e => setEditingType({ ...editingType, is_enabled: e.target.checked ? 1 : 0 })}
                            />
                            <Label htmlFor="is_enabled">Enabled</Label>
                        </CheckRow>
                        <Button type="submit" style={{ alignSelf: 'flex-end' }}>Save Changes</Button>
                    </Form>
                )}
            </Modal>
        </>
    );
};

export default RequestTypesPage;
