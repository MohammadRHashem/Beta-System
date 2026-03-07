import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getAllUsers, getAllRoles, createUser, updateUser, deleteUser } from '../services/api';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext';
import { FaPlus, FaUsers, FaEdit, FaTrash } from 'react-icons/fa';
import { format } from 'date-fns';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    flex-wrap: wrap;
`;

const Title = styled.h2`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: ${({ theme }) => theme.primary};
`;

const Card = styled.div`
    background: #fff;
    padding: 1.1rem 1.25rem 1rem;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08);
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.66rem 1rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow-x: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
`;

const Table = styled.table`
    width: 100%;
    min-width: 820px;
    border-collapse: collapse;
    margin-top: 0.85rem;
    font-size: 0.9rem;
    th, td {
        padding: 0.8rem 0.9rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        vertical-align: middle;
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
        font-size: 1rem;
        color: ${({ theme }) => theme.lightText};
        display: inline-flex;
        align-items: center;
        gap: 0.9rem;
        line-height: 1;
    }
    td.actions .actions-wrap svg {
        cursor: pointer;
    }
    td.actions .actions-wrap svg:hover {
        color: ${({ theme }) => theme.primary};
    }
`;

const StatusBadge = styled.span`
    padding: 0.3rem 0.8rem;
    border-radius: 12px;
    font-weight: 600;
    font-size: 0.8rem;
    color: #fff;
    background-color: ${({ active, theme }) => active ? theme.success : theme.error};
`;

const ModalForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
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
    padding: 0.68rem 0.74rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
`;

const RoleGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
`;

const RoleChipLabel = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.36rem 0.7rem;
    border-radius: 999px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    cursor: pointer;
    font-weight: 500;
`;

const RoleCheckbox = styled.input`
    width: 16px;
    height: 16px;
`;

const SwitchContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
`;

const SwitchLabel = styled.label`
    position: relative;
    display: inline-block;
    width: 50px;
    height: 28px;
`;

const SwitchInput = styled.input`
    opacity: 0;
    width: 0;
    height: 0;
    &:checked + span { background-color: ${({ theme }) => theme.secondary}; }
    &:checked + span:before { transform: translateX(22px); }
`;

const Slider = styled.span`
    position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
    background-color: #ccc; transition: .4s; border-radius: 34px;
    &:before {
        position: absolute; content: ""; height: 20px; width: 20px;
        left: 4px; bottom: 4px; background-color: white; transition: .4s;
        border-radius: 50%;
    }
`;


const UsersPage = () => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('admin:manage_users');

    const [users, setUsers] = useState([]);
    const [roles, setRoles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [formData, setFormData] = useState({});

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [usersRes, rolesRes] = await Promise.all([getAllUsers(), getAllRoles()]);
            setUsers(usersRes.data);
            setRoles(rolesRes.data);
        } catch (error) {
            alert('Failed to fetch user data.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenModal = (user = null) => {
        setEditingUser(user);
        if (user) {
            const selectedRoleIds = (user.role_ids || []).map(id => String(id));
            setFormData({
                username: user.username,
                password: '',
                role_ids: selectedRoleIds,
                is_active: user.is_active,
            });
        } else {
            const defaultRoleId = roles[0]?.id ? String(roles[0].id) : '';
            setFormData({
                username: '',
                password: '',
                role_ids: defaultRoleId ? [defaultRoleId] : [],
                is_active: true,
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
        setFormData({});
    };

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const toggleRole = (roleId) => {
        setFormData(prev => {
            const current = new Set(prev.role_ids || []);
            if (current.has(roleId)) {
                current.delete(roleId);
            } else {
                current.add(roleId);
            }
            return { ...prev, role_ids: Array.from(current) };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.role_ids || formData.role_ids.length === 0) {
            alert('Please select at least one role.');
            return;
        }
        try {
            if (editingUser) {
                const payload = { 
                    role_ids: (formData.role_ids || []).map(id => parseInt(id, 10)).filter(Number.isInteger),
                    is_active: formData.is_active
                };
                if (formData.username && formData.username !== editingUser.username) {
                    payload.username = formData.username;
                }
                if (formData.password) { payload.password = formData.password; }
                await updateUser(editingUser.id, payload);
            } else {
                const payload = {
                    username: formData.username,
                    password: formData.password,
                    role_ids: (formData.role_ids || []).map(id => parseInt(id, 10)).filter(Number.isInteger)
                };
                await createUser(payload);
            }
            fetchData();
            handleCloseModal();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save user.');
        }
    };

    const handleDelete = async (user) => {
        if (window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) {
            try {
                await deleteUser(user.id);
                fetchData();
            } catch (error) {
                alert(error.response?.data?.message || 'Failed to delete user.');
            }
        }
    };

    const formatTimestamp = (ts) => {
        if (!ts) return 'Never';
        try {
            // Ensure timestamp is treated as a valid Date object
            return format(new Date(ts), 'dd/MM/yyyy HH:mm');
        } catch {
            return 'Invalid Date';
        }
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title><FaUsers /> User Management</Title>
                    {canManage && (
                        <Button onClick={() => handleOpenModal(null)}><FaPlus /> Create User</Button>
                    )}
                </Header>
                <Card>
                    <p>Create and manage user accounts and their assigned roles.</p>
                    <TableWrapper>
                        <Table>
                            <thead>
                                <tr>
                                    <th>Username</th>
                                    <th>Roles</th>
                                    <th>Status</th>
                                    <th>Last Login</th>
                                    {canManage && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr><td colSpan={canManage ? 5 : 4}>Loading users...</td></tr>
                                ) : (
                                    users.map(user => (
                                        <tr key={user.id}>
                                            <td>{user.username}</td>
                                            <td>{user.role_names?.length ? user.role_names.join(', ') : <span style={{color: '#aaa'}}>None</span>}</td>
                                            <td><StatusBadge active={user.is_active}>{user.is_active ? 'Active' : 'Inactive'}</StatusBadge></td>
                                            <td>{formatTimestamp(user.last_login)}</td>
                                            {canManage && (
                                                <td className="actions">
                                                    <div className="actions-wrap">
                                                        <FaEdit onClick={() => handleOpenModal(user)} title="Edit User" />
                                                        <FaTrash onClick={() => handleDelete(user)} title="Delete User" />
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                    </TableWrapper>
                </Card>
            </PageContainer>
            
            <Modal isOpen={isModalOpen} onClose={handleCloseModal} maxWidth="500px">
                <h2>{editingUser ? 'Edit User' : 'Create New User'}</h2>
                <ModalForm onSubmit={handleSubmit}>
                    <InputGroup>
                        <Label htmlFor="username">Username</Label>
                        <Input 
                            id="username" 
                            name="username" 
                            value={formData.username || ''} 
                            onChange={handleChange} 
                            required 
                        />
                    </InputGroup>
                    <InputGroup>
                        <Label htmlFor="password">Password</Label>
                        <Input 
                            id="password"
                            name="password"
                            type="password"
                            value={formData.password || ''}
                            onChange={handleChange}
                            placeholder={editingUser ? 'Leave blank to keep current' : ''}
                            required={!editingUser}
                        />
                    </InputGroup>
                    <InputGroup>
                        <Label>Roles</Label>
                        <RoleGrid>
                            {roles.map(role => {
                                const roleId = String(role.id);
                                const checked = (formData.role_ids || []).includes(roleId);
                                return (
                                    <RoleChipLabel key={role.id}>
                                        <RoleCheckbox
                                            type="checkbox"
                                            checked={checked}
                                            onChange={() => toggleRole(roleId)}
                                        />
                                        {role.name}
                                    </RoleChipLabel>
                                );
                            })}
                        </RoleGrid>
                    </InputGroup>
                    {editingUser && (
                        <InputGroup>
                            <Label>Account Status</Label>
                            <SwitchContainer>
                                <SwitchLabel>
                                    <SwitchInput 
                                        type="checkbox" 
                                        name="is_active" 
                                        checked={!!formData.is_active} 
                                        onChange={handleChange}
                                    />
                                    <Slider />
                                </SwitchLabel>
                                <span>{formData.is_active ? 'Active' : 'Inactive'}</span>
                            </SwitchContainer>
                        </InputGroup>
                    )}
                    <Button type="submit" style={{ alignSelf: 'flex-end', marginTop: '1rem' }}>
                        {editingUser ? 'Save Changes' : 'Create User'}
                    </Button>
                </ModalForm>
            </Modal>
        </>
    );
};

export default UsersPage;
