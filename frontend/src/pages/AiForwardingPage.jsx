import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api, { toggleForwardingRule, toggleReplyRule } from '../services/api';
import Modal from '../components/Modal';
import { usePermissions } from '../context/PermissionContext';
import { FaEdit, FaTrash } from 'react-icons/fa';
import ComboBox from '../components/ComboBox';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    height: 100%;
    min-height: 0;
    overflow: auto;
`;

const Card = styled.div`
    background: ${({ theme }) => theme.surface};
    padding: 1.1rem 1.2rem 1rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadowMd};
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex-shrink: 0;

    &:last-child {
        flex: 1;
    }
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
    height: fit-content;
    &:disabled {
        background-color: ${({ theme }) => theme.borderStrong};
        cursor: not-allowed;
    }
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    min-height: 0;
    flex: 1;
`;

const RulesTable = styled.table`
    width: 100%;
    min-width: 980px;
    border-collapse: collapse;
    margin-top: 0.8rem;
    font-size: 0.9rem;
    th, td {
        padding: 0.78rem 0.85rem;
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

const SwitchContainer = styled.label`
    position: relative;
    display: inline-block;
    width: 50px;
    height: 28px;
`;

const SwitchInput = styled.input`
    opacity: 0;
    width: 0;
    height: 0;
    &:checked + span {
        background-color: ${({ theme }) => theme.secondary};
    }
    &:checked + span:before {
        transform: translateX(22px);
    }
    &:disabled + span {
        cursor: not-allowed;
        background-color: ${({ theme }) => theme.surfaceAlt};
    }
`;

const Slider = styled.span`
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: ${({ theme }) => theme.borderStrong};
    transition: .4s;
    border-radius: 34px;
    &:before {
        position: absolute;
        content: "";
        height: 20px;
        width: 20px;
        left: 4px;
        bottom: 4px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
    }
`;

const AiForwardingPage = ({ allGroups }) => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('settings:edit_rules');

    const [rules, setRules] = useState([]);
    const [trigger, setTrigger] = useState('');
    const [destination, setDestination] = useState('');

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState(null);

    const fetchRules = async () => {
        try {
            const { data } = await api.get('/settings/forwarding');
            setRules(data);
        } catch (error) {
            console.error("Failed to fetch forwarding rules:", error);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!trigger || !destination) return alert('Please fill out all fields.');
        
        const selectedGroup = allGroups.find(g => g.id === destination);
        try {
            await api.post('/settings/forwarding', {
                trigger_keyword: trigger,
                destination_group_jid: destination,
                destination_group_name: selectedGroup?.name,
                reply_with_group_name: false
            });
            alert('Rule created successfully!');
            setTrigger('');
            setDestination('');
            fetchRules();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create rule.');
        }
    };

    const handleDelete = async (ruleId) => {
        if (window.confirm('Are you sure you want to delete this rule?')) {
            try {
                await api.delete(`/settings/forwarding/${ruleId}`);
                alert('Rule deleted successfully.');
                fetchRules();
            } catch (error) {
                alert('Failed to delete rule.');
            }
        }
    };
    
    const openEditModal = (rule) => {
        setEditingRule(rule);
        setIsModalOpen(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                trigger_keyword: editingRule.trigger_keyword,
                destination_group_jid: editingRule.destination_group_jid,
                reply_with_group_name: editingRule.reply_with_group_name 
            };
            await api.put(`/settings/forwarding/${editingRule.id}`, payload);
            alert('Rule updated successfully!');
            setIsModalOpen(false);
            setEditingRule(null);
            fetchRules(); 
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to update rule.');
        }
    };

    const handleToggleEnabled = async (rule) => {
        const newEnabledState = !rule.is_enabled;
        try {
            await toggleForwardingRule(rule.id, newEnabledState);
            setRules(rules.map(r => r.id === rule.id ? { ...r, is_enabled: newEnabledState } : r));
        } catch (error) {
            alert('Failed to update rule status.');
        }
    };

    const handleToggleReply = async (rule) => {
        const newReplyState = !rule.reply_with_group_name;
        try {
            await toggleReplyRule(rule.id, newReplyState);
            setRules(rules.map(r => r.id === rule.id ? { ...r, reply_with_group_name: newReplyState } : r));
        } catch (error) {
            alert('Failed to update reply setting.');
        }
    };

    return (
        <>
            <PageContainer>
                {canEdit && (
                    <Card>
                        <h3>Create New Forwarding Rule</h3>
                        <Form onSubmit={handleSubmit}>
                            <InputGroup>
                                <Label>Trigger Keyword</Label>
                                <Input 
                                    type="text" 
                                    placeholder="e.g., trkbit"
                                    value={trigger}
                                    onChange={(e) => setTrigger(e.target.value)}
                                />
                            </InputGroup>
                            <InputGroup>
                            <Label>Destination Group</Label>
                                <ComboBox 
                                    options={allGroups}
                                    value={destination}
                                    onChange={(e) => setDestination(e.target.value)}
                                    placeholder="Search & select a group..."
                                />
                            </InputGroup>
                            <Button type="submit">Add Rule</Button>
                        </Form>
                    </Card>
                )}

                <Card>
                    <h3>Existing Rules</h3>
                    <TableWrapper>
                        <RulesTable>
                            <thead>
                                <tr>
                                    <th>Enabled</th>
                                    <th>Trigger Keyword</th>
                                    <th>Destination Group</th>
                                    <th>Reply with Group Name?</th>
                                    {canEdit && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {rules.map(rule => (
                                    <tr key={rule.id}>
                                        <td>
                                            <SwitchContainer>
                                                <SwitchInput 
                                                    type="checkbox" 
                                                    checked={!!rule.is_enabled}
                                                    onChange={() => handleToggleEnabled(rule)}
                                                    disabled={!canEdit}
                                                />
                                                <Slider />
                                            </SwitchContainer>
                                        </td>
                                        <td>{rule.trigger_keyword}</td>
                                        <td>{rule.destination_group_name || rule.destination_group_jid}</td>
                                        <td>
                                            <SwitchContainer>
                                                <SwitchInput 
                                                    type="checkbox" 
                                                    checked={!!rule.reply_with_group_name}
                                                    onChange={() => handleToggleReply(rule)}
                                                    disabled={!canEdit}
                                                />
                                                <Slider />
                                            </SwitchContainer>
                                        </td>
                                        {canEdit && (
                                            <td className="actions">
                                                <div className="actions-wrap">
                                                    <FaEdit onClick={() => openEditModal(rule)} title="Edit"/>
                                                    <FaTrash onClick={() => handleDelete(rule.id)} title="Delete"/>
                                                </div>
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
                {editingRule && (
                    <form onSubmit={handleUpdate}>
                        <h2>Edit Forwarding Rule</h2>
                        <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>Trigger Keyword</Label>
                            <Input 
                                type="text" 
                                value={editingRule.trigger_keyword}
                                onChange={(e) => setEditingRule({...editingRule, trigger_keyword: e.target.value})}
                            />
                        </InputGroup>
                         <InputGroup style={{marginBottom: '1.5rem'}}>
                            <Label>Destination Group</Label>
                             <ComboBox
                                options={allGroups}
                                value={editingRule.destination_group_jid}
                                onChange={(e) => setEditingRule({...editingRule, destination_group_jid: e.target.value})}
                                placeholder="Search & select a group..."
                            />
                        </InputGroup>
                        <Button type="submit" style={{width: '100%'}}>Save Changes</Button>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default AiForwardingPage;
