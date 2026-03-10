import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { usePermissions } from '../context/PermissionContext';

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

    &:last-child {
        flex: 1;
    }
`;

const SearchInput = styled.input`
    width: 100%;
    max-width: 400px;
    padding: 0.68rem 0.72rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    margin-bottom: 0.9rem;
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    min-height: 0;
    flex: 1;
`;

const SettingsTable = styled.table`
    width: 100%;
    min-width: 980px;
    border-collapse: collapse;
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
        opacity: 0.7;
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


const GroupSettingsPage = () => {
    const { hasPermission } = usePermissions();
    const canEdit = hasPermission('settings:edit_rules');

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
                <p>Enable or disable forwarding, archiving, and confirmation behavior per group.</p>
                <SearchInput
                    type="text"
                    placeholder="Search for a group..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
                <TableWrapper>
                    <SettingsTable>
                        <thead>
                            <tr>
                                <th>Group Name</th>
                                <th>Enable Forwarding</th>
                                <th>Enable Archiving</th>
                                <th>Enable Confirmation</th>
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
                                                disabled={!canEdit}
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
                                                disabled={!canEdit}
                                            />
                                            <Slider />
                                        </SwitchContainer>
                                    </td>
                                    <td>
                                        <SwitchContainer>
                                            <SwitchInput
                                                type="checkbox"
                                                checked={!!group.confirmation_enabled}
                                                onChange={() => handleToggle(group, 'confirmation_enabled', !!group.confirmation_enabled)}
                                                disabled={!canEdit}
                                            />
                                            <Slider />
                                        </SwitchContainer>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </SettingsTable>
                </TableWrapper>
            </Card>
        </PageContainer>
    );
};

export default GroupSettingsPage;
