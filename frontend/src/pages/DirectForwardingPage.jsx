import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { FaTrash, FaArrowRight } from 'react-icons/fa';
import ComboBox from '../components/ComboBox';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Form = styled.form`
    display: grid;
    grid-template-columns: 1fr auto 1fr auto;
    gap: 1.5rem;
    align-items: flex-end;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 600;
    color: ${({ theme }) => theme.primary};
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
    &:disabled {
        opacity: 0.6;
    }
`;

const RulesTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.5rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
    .actions {
        font-size: 1.1rem;
        svg {
            cursor: pointer;
            color: ${({ theme }) => theme.lightText};
            &:hover { color: ${({ theme }) => theme.error}; }
        }
    }
`;

const ArrowIcon = styled(FaArrowRight)`
    font-size: 1.5rem;
    color: ${({ theme }) => theme.lightText};
`;

const DirectForwardingPage = ({ allGroups }) => {
    const [rules, setRules] = useState([]);
    const [sourceJid, setSourceJid] = useState('');
    const [destinationJid, setDestinationJid] = useState('');
    const [loading, setLoading] = useState(true);

    const fetchRules = async () => {
        try {
            const { data } = await api.get('/direct-forwarding');
            setRules(data);
        } catch (error) {
            console.error("Failed to fetch rules:", error);
            alert('Failed to fetch existing rules.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchRules();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!sourceJid || !destinationJid) return alert('Please select both a source and a destination group.');
        if (sourceJid === destinationJid) return alert('Source and destination groups cannot be the same.');

        try {
            await api.post('/direct-forwarding', { source_group_jid: sourceJid, destination_group_jid: destinationJid });
            alert('Rule created successfully!');
            setSourceJid('');
            setDestinationJid('');
            fetchRules();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to create rule.');
        }
    };

    const handleDelete = async (ruleId) => {
        if (window.confirm('Are you sure you want to delete this direct forwarding rule?')) {
            try {
                await api.delete(`/direct-forwarding/${ruleId}`);
                alert('Rule deleted successfully.');
                fetchRules();
            } catch (error) {
                alert('Failed to delete rule.');
            }
        }
    };

    return (
        <PageContainer>
            <Card>
                <h3>Create New Direct Group Forwarding Rule</h3>
                <p>Media from a Source Group will be validated by AI. If it's a valid invoice, it will be sent to the Destination Group, overriding any keyword rules.</p>
                <Form onSubmit={handleSubmit}>
                    <InputGroup>
                        <Label>From (Source Group)</Label>
                        <ComboBox 
                            options={allGroups}
                            value={sourceJid}
                            onChange={(e) => setSourceJid(e.target.value)}
                            placeholder="Select a source group..."
                        />
                    </InputGroup>
                    <ArrowIcon />
                    <InputGroup>
                        <Label>To (Destination Group)</Label>
                        <ComboBox 
                            options={allGroups}
                            value={destinationJid}
                            onChange={(e) => setDestinationJid(e.target.value)}
                            placeholder="Select a destination group..."
                        />
                    </InputGroup>
                    <Button type="submit" disabled={!sourceJid || !destinationJid}>Add Rule</Button>
                </Form>
            </Card>

            <Card>
                <h3>Existing Direct Rules</h3>
                {loading ? <p>Loading rules...</p> : (
                    <RulesTable>
                        <thead>
                            <tr>
                                <th>Source Group</th>
                                <th>Destination Group</th>
                                <th className="actions">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.length === 0 ? (
                                <tr><td colSpan="3">No direct forwarding rules found.</td></tr>
                            ) : (
                                rules.map(rule => (
                                    <tr key={rule.id}>
                                        <td>{rule.source_group_name}</td>
                                        <td>{rule.destination_group_name}</td>
                                        <td className="actions">
                                            <FaTrash onClick={() => handleDelete(rule.id)} />
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </RulesTable>
                )}
            </Card>
        </PageContainer>
    );
};

export default DirectForwardingPage;