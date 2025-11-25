import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api, { toggleForwardingRule } from '../services/api';
import Modal from '../components/Modal';
import { FaEdit, FaTrash, FaReply } from 'react-icons/fa';
import ComboBox from '../components/ComboBox';

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
    height: fit-content;
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
    td.actions {
        display: flex;
        gap: 1rem;
        align-items: center;
        font-size: 1.1rem;
        svg {
            cursor: pointer;
            &:hover { color: ${({ theme }) => theme.primary}; }
        }
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
`;

const Slider = styled.span`
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
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

const CheckboxContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1rem;
    cursor: pointer;
    user-select: none;
`;

const AiForwardingPage = ({ allGroups }) => {
    const [rules, setRules] = useState([]);
    const [trigger, setTrigger] = useState('');
    const [destination, setDestination] = useState('');
    const [replyWithGroupName, setReplyWithGroupName] = useState(false);

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
                reply_with_group_name: replyWithGroupName
            });
            alert('Rule created successfully!');
            setTrigger('');
            setDestination('');
            setReplyWithGroupName(false);
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
        setReplyWithGroupName(!!rule.reply_with_group_name);
        setIsModalOpen(true);
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                trigger_keyword: editingRule.trigger_keyword,
                destination_group_jid: editingRule.destination_group_jid,
                reply_with_group_name: replyWithGroupName
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

    const handleToggle = async (rule) => {
        const newEnabledState = !rule.is_enabled;
        try {
            await toggleForwardingRule(rule.id, newEnabledState);
            setRules(rules.map(r => r.id === rule.id ? { ...r, is_enabled: newEnabledState } : r));
        } catch (error) {
            alert('Failed to update rule status.');
        }
    };

    return (
        <>
            <PageContainer>
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
                        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', marginBottom: '0.3rem' }}>
                            <CheckboxContainer onClick={() => setReplyWithGroupName(!replyWithGroupName)}>
                                <input type="checkbox" checked={replyWithGroupName} readOnly />
                                <Label style={{cursor: 'pointer'}}>Reply w/ Dest. Name</Label>
                            </CheckboxContainer>
                        </div>
                        <Button type="submit">Add Rule</Button>
                    </Form>
                </Card>

                <Card>
                    <h3>Existing Rules</h3>
                    <RulesTable>
                        <thead>
                            <tr>
                                <th>Enabled</th>
                                <th>Trigger Keyword</th>
                                <th>Destination Group</th>
                                <th>Reply</th>
                                <th>Actions</th>
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
                                                onChange={() => handleToggle(rule)}
                                            />
                                            <Slider />
                                        </SwitchContainer>
                                    </td>
                                    <td>{rule.trigger_keyword}</td>
                                    <td>{rule.destination_group_name || rule.destination_group_jid}</td>
                                    <td style={{ textAlign: 'center' }}>
                                        {rule.reply_with_group_name ? <FaReply title="Will reply with destination name" color="#00C49A" /> : <span style={{color: '#ccc'}}>-</span>}
                                    </td>
                                    <td className="actions">
                                        <FaEdit onClick={() => openEditModal(rule)} />
                                        <FaTrash onClick={() => handleDelete(rule.id)} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </RulesTable>
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
                         <InputGroup style={{marginBottom: '1rem'}}>
                            <Label>Destination Group</Label>
                             <ComboBox
                                options={allGroups}
                                value={editingRule.destination_group_jid}
                                onChange={(e) => setEditingRule({...editingRule, destination_group_jid: e.target.value})}
                                placeholder="Search & select a group..."
                            />
                        </InputGroup>
                        <CheckboxContainer onClick={() => setReplyWithGroupName(!replyWithGroupName)} style={{marginBottom: '1.5rem'}}>
                            <input type="checkbox" checked={replyWithGroupName} readOnly />
                            <Label style={{cursor: 'pointer'}}>Reply with Destination Group Name in Source Group</Label>
                        </CheckboxContainer>
                        <Button type="submit" style={{width: '100%'}}>Save Changes</Button>
                    </form>
                )}
            </Modal>
        </>
    );
};

export default AiForwardingPage;