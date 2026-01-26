import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getAllUsers, getAllRoles, createUser, updateUser, deleteUser } from '../services/api';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK
import { FaPlus, FaUsers, FaEdit, FaTrash } from 'react-icons/fa';
import { format } from 'date-fns';

// Styled Components
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.5rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        vertical-align: middle;
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
    .actions {
        font-size: 1.1rem;
        color: ${({ theme }) => theme.lightText};
        cursor: pointer;
        &:hover {
            color: ${({ theme }) => theme.primary};
        }
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

const RoleGrid = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
`;

const RoleChipLabel = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.75rem;
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
    const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
    const canManage = hasPermission('admin:manage_users'); // 3. DEFINE MANAGE CAPABILITY

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
                    {/* 4. WRAP CREATE BUTTON IN PERMISSION CHECK */}
                    {canManage && (
                        <Button onClick={() => handleOpenModal(null)}><FaPlus /> Create User</Button>
                    )}
                </Header>
                <Card>
                    <p>Create and manage user accounts and their assigned roles.</p>
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
                                        {/* 5. WRAP ACTIONS COLUMN IN PERMISSION CHECK */}
                                        {canManage && (
                                            <td className="actions">
                                                <FaEdit onClick={() => handleOpenModal(user)} title="Edit User" />
                                                <FaTrash onClick={() => handleDelete(user)} title="Delete User" />
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card>
            </PageContainer>
            
            {/* Modal is implicitly protected as it can only be opened by a user with `canManage` permissions */}
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
