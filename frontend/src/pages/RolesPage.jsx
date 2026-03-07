import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { getAllRoles, getRolePermissions, updateRolePermissions, createRole, updateRole, deleteRole } from '../services/api';
import { usePermissions } from '../context/PermissionContext';
import { FaShieldAlt, FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import Modal from '../components/Modal';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
`;

const Title = styled.h2`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: ${({ theme }) => theme.primary};
`;

const MainLayout = styled.div`
    display: grid;
    grid-template-columns: minmax(260px, 320px) 1fr;
    gap: 1rem;
    align-items: flex-start;

    @media (max-width: 992px) {
        grid-template-columns: 1fr;
    }
`;

const Card = styled.div`
    background: #fff;
    padding: 1.1rem;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08);
`;

const RoleList = styled.ul`
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: calc(100vh - 280px);
    overflow-y: auto;

    @media (max-width: 992px) {
        max-height: none;
    }
`;

const RoleListItem = styled.li`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.9rem;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    border-left: 4px solid transparent;
    color: ${({ theme }) => theme.text};

    &:hover {
        background-color: ${({ theme }) => theme.background};
    }

    &.active {
        background-color: #e6fff9;
        color: ${({ theme }) => theme.secondary};
        border-left-color: ${({ theme }) => theme.secondary};
    }
`;

const PermissionsPanel = styled.div`
    position: sticky;
    top: 1rem;

    @media (max-width: 992px) {
        position: static;
    }
`;

const PanelHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    flex-wrap: wrap;

    h3 {
        margin: 0;
    }
`;

const Button = styled.button`
    background-color: ${({ theme }) => theme.secondary};
    color: white;
    border: none;
    padding: 0.55rem 0.95rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    &:disabled {
        background-color: #ccc;
        cursor: not-allowed;
    }
`;

const PermissionGroup = styled.div`
    margin-bottom: 1.3rem;

    h4 {
        margin: 0 0 0.9rem 0;
        text-transform: uppercase;
        font-size: 0.82rem;
        color: ${({ theme }) => theme.lightText};
        border-bottom: 1px solid ${({ theme }) => theme.border};
        padding-bottom: 0.45rem;
    }
`;

const PermissionGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.65rem;
`;

const PermissionCheckbox = styled.label`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.45rem 0.5rem;
    border-radius: 6px;
    cursor: pointer;
    background-color: #f9f9f9;
    border: 1px solid ${({ theme }) => theme.border};

    &:hover {
        background-color: #f0f0f0;
    }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    &:disabled {
        cursor: not-allowed;
    }
`;

const RoleListHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.85rem;
    h3 { margin: 0; }
`;

const AddRoleButton = styled.button`
    background: none;
    border: none;
    color: ${({ theme }) => theme.secondary};
    font-size: 1.5rem;
    cursor: pointer;
    &:hover { color: #00a885; }
`;

const RoleActions = styled.div`
    margin-left: auto;
    padding-left: 1rem;
    display: inline-flex;
    align-items: center;
    gap: 0.65rem;
    svg {
        cursor: pointer;
        color: ${({ theme }) => theme.lightText};
        &:hover { color: ${({ theme }) => theme.primary}; }
    }
`;

const ModalForm = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;

    label {
        font-weight: 500;
        font-size: 0.85rem;
    }
`;

const Label = styled.label`
    font-weight: 500;
    font-size: 0.9rem;
`;

const Input = styled.input`
    width: 100%;
    padding: 0.68rem 0.74rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    outline: none;
`;

const PermissionsScrollArea = styled.div`
    max-height: calc(100vh - 250px);
    overflow-y: auto;
    padding-right: 0.5rem;

    @media (max-height: 800px) and (min-width: 1024px) {
        max-height: calc(100vh - 220px);
    }

    @media (max-width: 992px) {
        max-height: none;
        overflow: visible;
        padding-right: 0;
    }
`;

const RolesPage = () => {
    const { hasPermission } = usePermissions();
    const canManage = hasPermission('admin:manage_roles');

    const [roles, setRoles] = useState([]);
    const [selectedRole, setSelectedRole] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loadingRoles, setLoadingRoles] = useState(true);
    const [loadingPermissions, setLoadingPermissions] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRoleModalOpen, setIsRoleModalOpen] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [roleFormData, setRoleFormData] = useState({ name: '', description: '' });

    const fetchRoles = useCallback(async () => {
        setLoadingRoles(true);
        try {
            const { data } = await getAllRoles();
            setRoles(data);
            if (!selectedRole && data.length > 0) {
                setSelectedRole(data[0]);
            } else if (selectedRole) {
                setSelectedRole(data.find((r) => r.id === selectedRole.id) || data[0]);
            }
        } catch (error) {
            alert('Failed to fetch roles.');
        } finally {
            setLoadingRoles(false);
        }
    }, [selectedRole]);

    useEffect(() => { fetchRoles(); }, []);

    useEffect(() => {
        if (selectedRole) {
            setLoadingPermissions(true);
            getRolePermissions(selectedRole.id)
                .then((res) => setPermissions(res.data))
                .catch(() => alert(`Failed to fetch permissions for ${selectedRole.name}.`))
                .finally(() => setLoadingPermissions(false));
        }
    }, [selectedRole]);

    const handleOpenRoleModal = (role = null) => {
        setEditingRole(role);
        setRoleFormData(role ? { name: role.name, description: role.description } : { name: '', description: '' });
        setIsRoleModalOpen(true);
    };

    const handleRoleFormChange = (e) => {
        setRoleFormData({ ...roleFormData, [e.target.name]: e.target.value });
    };

    const handleSaveRole = async (e) => {
        e.preventDefault();
        try {
            if (editingRole) {
                await updateRole(editingRole.id, roleFormData);
            } else {
                await createRole(roleFormData);
            }
            setIsRoleModalOpen(false);
            fetchRoles();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to save role.');
        }
    };

    const handleDeleteRole = async (role) => {
        if (role.name === 'Administrator') return;
        if (window.confirm(`Delete role "${role.name}"? Users must be reassigned first.`)) {
            try {
                await deleteRole(role.id);
                if (selectedRole?.id === role.id) {
                    setSelectedRole(null);
                    setPermissions([]);
                }
                fetchRoles();
            } catch (error) {
                alert(error.response?.data?.message || 'Failed to delete role.');
            }
        }
    };

    const handlePermissionChange = (permissionId) => {
        setPermissions((prev) => prev.map((p) => (
            p.id === permissionId ? { ...p, has_permission: !p.has_permission } : p
        )));
    };

    const normalizeModule = (moduleName) => {
        if (!moduleName) return 'other';
        return moduleName === 'broadcasting' ? 'broadcast' : moduleName;
    };

    const groupedPermissions = useMemo(() => (
        permissions.reduce((acc, p) => {
            const moduleName = normalizeModule(p.module);
            (acc[moduleName] = acc[moduleName] || []).push(p);
            return acc;
        }, {})
    ), [permissions]);

    const handleSaveChanges = async () => {
        if (!selectedRole) return;
        setIsSaving(true);
        try {
            const enabledPermissionIds = permissions.filter((p) => p.has_permission).map((p) => p.id);
            await updateRolePermissions(selectedRole.id, enabledPermissionIds);
            alert(`Permissions for "${selectedRole.name}" updated successfully.`);
        } catch (error) {
            alert('Failed to save permissions.');
        } finally {
            setIsSaving(false);
        }
    };

    const isRoleImmutable = selectedRole?.name === 'Administrator';

    return (
        <>
            <PageContainer>
                <Title><FaShieldAlt /> Roles & Permissions</Title>
                <MainLayout>
                    <Card>
                        <RoleListHeader>
                            <h3>Roles</h3>
                            {canManage && (
                                <AddRoleButton onClick={() => handleOpenRoleModal(null)} title="Add New Role">
                                    <FaPlus />
                                </AddRoleButton>
                            )}
                        </RoleListHeader>
                        {loadingRoles ? <p>Loading roles...</p> : (
                            <RoleList>
                                {roles.map((role) => (
                                    <RoleListItem
                                        key={role.id}
                                        className={selectedRole?.id === role.id ? 'active' : ''}
                                        onClick={() => setSelectedRole(role)}
                                    >
                                        {role.name}
                                        {canManage && role.name !== 'Administrator' && (
                                            <RoleActions>
                                                <FaEdit onClick={(e) => { e.stopPropagation(); handleOpenRoleModal(role); }} />
                                                <FaTrash onClick={(e) => { e.stopPropagation(); handleDeleteRole(role); }} />
                                            </RoleActions>
                                        )}
                                    </RoleListItem>
                                ))}
                            </RoleList>
                        )}
                    </Card>
                    <PermissionsPanel>
                        <Card>
                            {selectedRole ? (
                                <>
                                    <PanelHeader>
                                        <h3>Permissions for "{selectedRole.name}"</h3>
                                        {canManage && !isRoleImmutable && (
                                            <Button onClick={handleSaveChanges} disabled={isSaving || loadingPermissions}>
                                                {isSaving ? 'Saving...' : 'Save Changes'}
                                            </Button>
                                        )}
                                    </PanelHeader>
                                    {loadingPermissions ? <p>Loading permissions...</p> : (
                                        <PermissionsScrollArea>
                                            {Object.entries(groupedPermissions).map(([moduleName, perms]) => (
                                                <PermissionGroup key={moduleName}>
                                                    <h4>{moduleName}</h4>
                                                    <PermissionGrid>
                                                        {perms.map((p) => (
                                                            <PermissionCheckbox key={p.id}>
                                                                <Checkbox
                                                                    checked={!!p.has_permission}
                                                                    onChange={() => handlePermissionChange(p.id)}
                                                                    disabled={!canManage || isRoleImmutable}
                                                                />
                                                                <span title={p.description}>{p.action}</span>
                                                            </PermissionCheckbox>
                                                        ))}
                                                    </PermissionGrid>
                                                </PermissionGroup>
                                            ))}
                                        </PermissionsScrollArea>
                                    )}
                                </>
                            ) : (
                                !loadingRoles && <p>Select a role from the left to manage its permissions.</p>
                            )}
                        </Card>
                    </PermissionsPanel>
                </MainLayout>
            </PageContainer>

            <Modal isOpen={isRoleModalOpen} onClose={() => setIsRoleModalOpen(false)}>
                <ModalForm onSubmit={handleSaveRole}>
                    <h2>{editingRole ? 'Edit Role' : 'Create New Role'}</h2>
                    <InputGroup>
                        <Label>Role Name</Label>
                        <Input name="name" value={roleFormData.name} onChange={handleRoleFormChange} required />
                    </InputGroup>
                    <InputGroup>
                        <Label>Description (Optional)</Label>
                        <Input name="description" value={roleFormData.description} onChange={handleRoleFormChange} />
                    </InputGroup>
                    <Button type="submit" style={{ alignSelf: 'flex-end' }}>Save Role</Button>
                </ModalForm>
            </Modal>
        </>
    );
};

export default RolesPage;
