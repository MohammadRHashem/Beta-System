import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { FaTrash } from 'react-icons/fa';

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

const AdminsPage = () => {
    const [admins, setAdmins] = useState([]);
    const [name, setName] = useState('');
    const [adminJid, setAdminJid] = useState('');

    const fetchAdmins = async () => {
        try {
            const { data } = await api.get('/admins');
            setAdmins(data);
        } catch (error) {
            console.error("Failed to fetch admins:", error);
        }
    };

    useEffect(() => {
        fetchAdmins();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !adminJid) return alert('Please fill out all fields.');
        
        try {
            await api.post('/admins', { name, admin_jid: adminJid });
            alert('Admin added successfully!');
            setName('');
            setAdminJid('');
            fetchAdmins();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to add admin.');
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('Are you sure you want to remove this admin?')) {
            try {
                await api.delete(`/admins/${id}`);
                alert('Admin removed successfully.');
                fetchAdmins();
            } catch (error) {
                alert('Failed to remove admin.');
            }
        }
    };

    return (
        <PageContainer>
            <Card>
                <h3>Add New Abbreviation Admin</h3>
                <p>Have the user send `!getid` in a group to get their JID.</p>
                <Form onSubmit={handleSubmit}>
                    <InputGroup>
                        <Label>Name</Label>
                        <Input 
                            type="text" 
                            placeholder="e.g., John Doe"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </InputGroup>
                    <InputGroup>
                        <Label>Admin JID (WhatsApp ID)</Label>
                        <Input 
                            type="text" 
                            placeholder="e.g., 5511...c.us"
                            value={adminJid}
                            onChange={(e) => setAdminJid(e.target.value)}
                        />
                    </InputGroup>
                    <Button type="submit">Add Admin</Button>
                </Form>
            </Card>

            <Card>
                <h3>Existing Admins</h3>
                <RulesTable>
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Admin JID</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {admins.map(admin => (
                            <tr key={admin.id}>
                                <td>{admin.name}</td>
                                <td>{admin.admin_jid}</td>
                                <td className="actions">
                                    <FaTrash onClick={() => handleDelete(admin.id)} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </RulesTable>
            </Card>
        </PageContainer>
    );
};

export default AdminsPage;