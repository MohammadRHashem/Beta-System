import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK
import { FaEdit, FaTrash } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Form = styled.form`
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-grow: 1;
    min-width: 250px;
`;

const Label = styled.label`
    font-weight: 500;
    color: ${({ theme }) => theme.text};
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    &:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
`;

const RulesTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
    .actions {
        display: flex;
        gap: 1rem;
        font-size: 1.1rem;
        svg {
            cursor: pointer;
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
    }
`;
const Textarea = styled.textarea`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
    min-height: 100px;
    font-family: inherit;
`;

const AbbreviationsPage = () => {
    const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
    const canEdit = hasPermission('settings:edit_abbreviations'); // 3. DEFINE EDIT CAPABILITY

    const [abbreviations, setAbbreviations] = useState([]);
    const [trigger, setTrigger] = useState('');
    const [response, setResponse] = useState('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAbbr, setEditingAbbr] = useState(null);

    const fetchAbbrs = async () => {
        try {
            const { data } = await api.get('/abbreviations');
            setAbbreviations(data);
        } catch (error) {
            console.error("Failed to fetch abbreviations:", error);
        }
    };

    useEffect(() => {
        fetchAbbrs();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!trigger || !response) return alert('Please fill out all fields.');
        
        try {
            await api.post('/abbreviations', { trigger, response });
            alert('Abbreviation created successfully!');
            setTrigger('');
            setResponse('');
            fetchAbbrs();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create abbreviation.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to delete this abbreviation?')) {
            try {
                await api.delete(`/abbreviations/${id}`);
                alert('Abbreviation deleted successfully.');
                fetchAbbrs();
            } catch (error) {
                alert('Failed to delete abbreviation.');
            }
        }
    };

    const openEditModal = (abbr) => {
        setEditingAbbr(abbr);
        setIsModalOpen(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/abbreviations/${editingAbbr.id}`, {
                trigger: editingAbbr.trigger,
                response: editingAbbr.response
            });
            alert('Abbreviation updated successfully!');
            setIsModalOpen(false);
            setEditingAbbr(null);
            fetchAbbrs();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to update abbreviation.');
        }
    };

    return (
        <>
            <PageContainer>
                {/* 4. WRAP CREATION FORM IN PERMISSION CHECK */}
                {canEdit && (
                    <Card>
                        <h3>Create New Abbreviation</h3>
                        <Form onSubmit={handleSubmit}>
                            <InputGroup>
                                <Label>Trigger</Label>
                                <Input 
                                    type="text" 
                                    placeholder="e.g., !hello"
                                    value={trigger}
                                    onChange={(e) => setTrigger(e.target.value)}
                                />
                            </InputGroup>
                            <InputGroup>
                                <Label>Full Response</Label>
                                <Textarea
                                    placeholder="The full message to replace the trigger..."
                                    value={response}
                                    onChange={(e) => setResponse(e.target.value)}
                                />
                            </InputGroup>
                            <Button type="submit">Add Abbreviation</Button>
                        </Form>
                    </Card>
                )}

                <Card>
                    <h3>Existing Abbreviations</h3>
                    <RulesTable>
                        <thead>
                            <tr>
                                <th>Trigger</th>
                                <th>Response</th>
                                {canEdit && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {abbreviations.map(abbr => (
                                <tr key={abbr.id}>
                                    <td>{abbr.trigger}</td>
                                    <td>{abbr.response}</td>
                                    {/* 5. WRAP ACTIONS IN PERMISSION CHECK */}
                                    {canEdit && (
                                        <td className="actions">
                                            <FaEdit onClick={() => openEditModal(abbr)} title="Edit"/>
                                            <FaTrash onClick={() => handleDelete(abbr.id)} title="Delete"/>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </RulesTable>
                </Card>
            </PageContainer>

            {/* Modal remains the same, as it can only be opened by a user with edit permissions */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingAbbr && (
                    <form onSubmit={handleUpdate}>
                        <h2>Edit Abbreviation</h2>
                        <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>Trigger</Label>
                            <Input 
                                type="text" 
                                value={editingAbbr.trigger}
                                onChange={(e) => setEditingAbbr({...editingAbbr, trigger: e.target.value})}
                            />
                        </InputGroup>
                        <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>Full Response</Label>
                            <Textarea 
                                value={editingAbbr.response}
                                onChange={(e) => setEditingAbbr({...editingAbbr, response: e.target.value})}
                            />
                        </InputGroup>
                        <Button type="submit" style={{width: '100%'}}>Save Changes</Button>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default AbbreviationsPage;