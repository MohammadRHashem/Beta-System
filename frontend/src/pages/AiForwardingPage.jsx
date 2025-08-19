import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import api from '../services/api';

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
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-grow: 1;
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

const Select = styled.select`
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
`;

const AiForwardingPage = ({ allGroups }) => {
    const [rules, setRules] = useState([]);
    const [trigger, setTrigger] = useState('');
    const [destination, setDestination] = useState('');
    const [groupSearch, setGroupSearch] = useState('');

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
        if (!trigger || !destination) {
            alert('Please fill out all fields.');
            return;
        }
        const selectedGroup = allGroups.find(g => g.id === destination);
        try {
            await api.post('/settings/forwarding', {
                trigger_keyword: trigger,
                destination_group_jid: destination,
                destination_group_name: selectedGroup?.name
            });
            alert('Rule created successfully!');
            setTrigger('');
            setDestination('');
            fetchRules();
        } catch (error) {
            alert('Failed to create rule.');
        }
    };

    const filteredGroups = useMemo(() => {
        return (allGroups || []).filter(g =>
            g.name && g.name.toLowerCase().includes(groupSearch.toLowerCase())
        );
    }, [allGroups, groupSearch]);

    return (
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
                        <Input 
                            type="text" 
                            placeholder="Search for a group..."
                            value={groupSearch}
                            onChange={(e) => setGroupSearch(e.target.value)}
                        />
                        <Select value={destination} onChange={(e) => setDestination(e.target.value)} required>
                            <option value="" disabled>Select a destination</option>
                            {filteredGroups.map(group => (
                                <option key={group.id} value={group.id}>{group.name}</option>
                            ))}
                        </Select>
                    </InputGroup>
                    <Button type="submit">Add Rule</Button>
                </Form>
            </Card>

            <Card>
                <h3>Existing Rules</h3>
                <RulesTable>
                    <thead>
                        <tr>
                            <th>Trigger Keyword</th>
                            <th>Destination Group</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rules.map(rule => (
                            <tr key={rule.id}>
                                <td>{rule.trigger_keyword}</td>
                                <td>{rule.destination_group_name || rule.destination_group_jid}</td>
                            </tr>
                        ))}
                    </tbody>
                </RulesTable>
            </Card>
        </PageContainer>
    );
};

export default AiForwardingPage;