import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import Modal from '../components/Modal';
import { FaEdit, FaTrash, FaPlus, FaCodeBranch } from 'react-icons/fa';

const PageContainer = styled.div` display: flex; flex-direction: column; gap: 2rem; `;
const Card = styled.div` background: #fff; padding: 1.5rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); `;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; `;
const Button = styled.button` background-color: ${({ theme }) => theme.secondary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; `;
const RulesTable = styled.table` width: 100%; border-collapse: collapse; margin-top: 1rem; th, td { padding: 1rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; } th { background-color: ${({ theme }) => theme.background}; } td.actions { display: flex; gap: 1rem; font-size: 1.1rem; svg { cursor: pointer; &:hover { color: ${({ theme }) => theme.primary}; } } } `;
const Form = styled.form` display: flex; flex-direction: column; gap: 1rem; `;
const InputGroup = styled.div` display: flex; flex-direction: column; gap: 0.5rem; `;
const Label = styled.label` font-weight: 500; color: ${({ theme }) => theme.text}; `;
const Input = styled.input` padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; font-size: 1rem; `;
const Code = styled.code` background: #eee; padding: 0.2rem 0.4rem; border-radius: 4px; font-family: 'Courier New', Courier, monospace; `;

const RequestTypesPage = () => {
    const [types, setTypes] = useState([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingType, setEditingType] = useState(null);

    const fetchTypes = async () => {
        const { data } = await api.get('/request-types');
        setTypes(data);
    };

    useEffect(() => {
        fetchTypes();
    }, []);

    const openEditModal = (type) => {
        setEditingType(type);
        setIsModalOpen(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        try {
            if (editingType.id) {
                await api.put(`/request-types/${editingType.id}`, editingType);
            } else {
                await api.post('/request-types', editingType);
            }
            fetchTypes();
            setIsModalOpen(false);
        } catch (error) {
            alert('Failed to save request type.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this trigger?')) {
            await api.delete(`/request-types/${id}`);
            fetchTypes();
        }
    };

    return (
        <>
            <PageContainer>
                <Card>
                    <Header>
                        <h2 style={{display: 'flex', alignItems: 'center', gap: '0.5rem'}}><FaCodeBranch/> Client Request Triggers</h2>
                        <Button onClick={() => openEditModal({ name: '', trigger_regex: '', acknowledgement_reaction: '🔔', is_enabled: 1 })}><FaPlus /> New Trigger</Button>
                    </Header>
                    <p>Configure regular expressions to automatically capture specific client requests from chat messages.</p>
                    <RulesTable>
                        <thead><tr><th>Enabled</th><th>Name</th><th>Trigger Regex</th><th>Reaction</th><th>Actions</th></tr></thead>
                        <tbody>
                            {types.map(type => (
                                <tr key={type.id}>
                                    <td>{type.is_enabled ? 'Yes' : 'No'}</td>
                                    <td>{type.name}</td>
                                    <td><Code>{type.trigger_regex}</Code></td>
                                    <td>{type.acknowledgement_reaction}</td>
                                    <td className="actions">
                                        <FaEdit onClick={() => openEditModal(type)} />
                                        <FaTrash onClick={() => handleDelete(type.id)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </RulesTable>
                </Card>
            </PageContainer>
            
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingType && (
                    <Form onSubmit={handleSave}>
                        <h2>{editingType.id ? 'Edit' : 'Create'} Request Trigger</h2>
                        <InputGroup><Label>Name</Label><Input type="text" value={editingType.name} onChange={e => setEditingType({...editingType, name: e.target.value})} required /></InputGroup>
                        <InputGroup>
                            <Label>Trigger Regex</Label>
                            <Input type="text" value={editingType.trigger_regex} onChange={e => setEditingType({...editingType, trigger_regex: e.target.value})} required />
                            <small>Must contain one capture group <Code>()</Code> for the content. E.g., <Code>SWIFT: (\\w+)</Code></small>
                        </InputGroup>
                        <InputGroup><Label>Acknowledgement Reaction</Label><Input type="text" value={editingType.acknowledgement_reaction} onChange={e => setEditingType({...editingType, acknowledgement_reaction: e.target.value})} /></InputGroup>
                        <InputGroup style={{flexDirection: 'row', alignItems: 'center'}}><input type="checkbox" id="is_enabled" checked={!!editingType.is_enabled} onChange={e => setEditingType({...editingType, is_enabled: e.target.checked ? 1 : 0})} /><Label htmlFor="is_enabled">Enabled</Label></InputGroup>
                        <Button type="submit" style={{alignSelf: 'flex-end'}}>Save Changes</Button>
                    </Form>
                )}
            </Modal>
        </>
    );
};

export default RequestTypesPage;