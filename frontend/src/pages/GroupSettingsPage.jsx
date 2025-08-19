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

const SearchInput = styled.input`
    width: 100%;
    max-width: 400px;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
    margin-bottom: 1.5rem;
`;

const SettingsTable = styled.table`
    width: 100%;
    border-collapse: collapse;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
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


const GroupSettingsPage = () => {
    const [settings, setSettings] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchSettings = async () => {
        try {
            const { data } = await api.get('/settings/groups');
            setSettings(data);
        } catch (error) {
            console.error("Failed to fetch group settings:", error);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleToggle = async (group, setting, currentValue) => {
        const newValue = !currentValue;
        try {
            await api.post('/settings/groups', {
                group_jid: group.group_jid,
                group_name: group.group_name,
                setting: setting,
                value: newValue
            });
            // Optimistically update UI
            setSettings(prevSettings => 
                prevSettings.map(s => 
                    s.group_jid === group.group_jid ? { ...s, [setting]: newValue } : s
                )
            );
        } catch (error) {
            alert('Failed to update setting.');
        }
    };

    const filteredSettings = useMemo(() => {
        return (settings || []).filter(s =>
            s.group_name && s.group_name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [settings, searchTerm]);

    return (
        <PageContainer>
            <Card>
                <h3>Group Processing Settings</h3>
                <p>Enable or disable AI forwarding and database archiving for each group.</p>
                <SearchInput
                    type="text"
                    placeholder="Search for a group..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <SettingsTable>
                    <thead>
                        <tr>
                            <th>Group Name</th>
                            <th>Enable Forwarding</th>
                            <th>Enable Archiving</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSettings.map(group => (
                            <tr key={group.group_jid}>
                                <td>{group.group_name}</td>
                                <td>
                                    <SwitchContainer>
                                        <SwitchInput 
                                            type="checkbox" 
                                            checked={!!group.forwarding_enabled}
                                            onChange={() => handleToggle(group, 'forwarding_enabled', !!group.forwarding_enabled)}
                                        />
                                        <Slider />
                                    </SwitchContainer>
                                </td>
                                <td>
                                    <SwitchContainer>
                                        <SwitchInput 
                                            type="checkbox"
                                            checked={!!group.archiving_enabled}
                                            onChange={() => handleToggle(group, 'archiving_enabled', !!group.archiving_enabled)}
                                        />
                                        <Slider />
                                    </SwitchContainer>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </SettingsTable>
            </Card>
        </PageContainer>
    );
};

export default GroupSettingsPage;