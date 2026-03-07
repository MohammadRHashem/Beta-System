import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import Modal from '../components/Modal';
import { FaEdit, FaTrash } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.1rem 1.2rem 1rem;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08);
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
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.66rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow-x: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
`;

const RulesTable = styled.table`
    width: 100%;
    min-width: 720px;
    border-collapse: collapse;
    margin-top: 0.8rem;
    font-size: 0.9rem;
    th, td {
        padding: 0.78rem 0.85rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        white-space: nowrap;
    }
    th {
        background-color: ${({ theme }) => theme.background};
        font-size: 0.84rem;
        letter-spacing: 0.01em;
    }
    td.actions {
        vertical-align: middle;
    }
    td.actions .actions-wrap {
        display: inline-flex;
        align-items: center;
        gap: 1rem;
        font-size: 1.1rem;
        line-height: 1;
    }
    td.actions .actions-wrap svg {
        cursor: pointer;
    }
    td.actions .actions-wrap svg:hover {
        color: ${({ theme }) => theme.primary};
    }
`;

const ChavePixPage = () => {
    const [keys, setKeys] = useState([]);
    const [name, setName] = useState('');
    const [pixKey, setPixKey] = useState('');
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingKey, setEditingKey] = useState(null);

    const fetchKeys = async () => {
        try {
            const { data } = await api.get('/chave-pix');
            setKeys(data);
        } catch (error) {
            console.error("Failed to fetch PIX keys:", error);
        }
    };

    useEffect(() => {
        fetchKeys();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !pixKey) return alert('Please fill out all fields.');
        
        try {
            await api.post('/chave-pix', { name, pix_key: pixKey });
            alert('PIX Key created successfully!');
            setName('');
            setPixKey('');
            fetchKeys();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create key.');
        }
    };

    const handleDelete = async (keyId) => {
        if (window.confirm('Are you sure you want to delete this key?')) {
            try {
                await api.delete(`/chave-pix/${keyId}`);
                alert('Key deleted successfully.');
                fetchKeys();
            } catch (error) {
                alert('Failed to delete key.');
            }
        }
    };

    const openEditModal = (key) => {
        setEditingKey(key);
        setIsModalOpen(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.put(`/chave-pix/${editingKey.id}`, {
                name: editingKey.name,
                pix_key: editingKey.pix_key
            });
            alert('Key updated successfully!');
            setIsModalOpen(false);
            setEditingKey(null);
            fetchKeys();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to update key.');
        }
    };

    return (
        <>
            <PageContainer>
                <Card>
                    <h3>Create New Chave PIX</h3>
                    <Form onSubmit={handleSubmit}>
                        <InputGroup>
                            <Label>Name</Label>
                            <Input 
                                type="text" 
                                placeholder="e.g., TRK Cashway"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </InputGroup>
                        <InputGroup>
                            <Label>PIX Key</Label>
                            <Input 
                                type="text" 
                                placeholder="e.g., cashway@trkbit.co"
                                value={pixKey}
                                onChange={(e) => setPixKey(e.target.value)}
                            />
                        </InputGroup>
                        <Button type="submit">Add Key</Button>
                    </Form>
                </Card>

                <Card>
                    <h3>Existing PIX Keys</h3>
                    <TableWrapper>
                        <RulesTable>
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>PIX Key</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {keys.map(key => (
                                    <tr key={key.id}>
                                        <td>{key.name}</td>
                                        <td>{key.pix_key}</td>
                                        <td className="actions">
                                            <div className="actions-wrap">
                                                <FaEdit onClick={() => openEditModal(key)} />
                                                <FaTrash onClick={() => handleDelete(key.id)} />
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </RulesTable>
                    </TableWrapper>
                </Card>
            </PageContainer>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
                {editingKey && (
                    <form onSubmit={handleUpdate}>
                        <h2>Edit PIX Key</h2>
                        <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>Name</Label>
                            <Input 
                                type="text" 
                                value={editingKey.name}
                                onChange={(e) => setEditingKey({...editingKey, name: e.target.value})}
                            />
                        </InputGroup>
                        <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>PIX Key</Label>
                            <Input 
                                type="text" 
                                value={editingKey.pix_key}
                                onChange={(e) => setEditingKey({...editingKey, pix_key: e.target.value})}
                            />
                        </InputGroup>
                        <Button type="submit" style={{width: '100%'}}>Save Changes</Button>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default ChavePixPage;
