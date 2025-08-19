import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { createBatch, updateBatch } from '../services/api';
import { FaSyncAlt } from 'react-icons/fa';

const Container = styled.div`
    background: #fff;
    padding: 1.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    height: fit-content;
    display: flex;
    flex-direction: column;
`;

const HeaderContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
`;

const SyncButton = styled.button`
    background: transparent;
    border: 1px solid ${({ theme }) => theme.primary};
    color: ${({ theme }) => theme.primary};
    padding: 0.5rem 0.75rem;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    cursor: pointer;
    font-weight: bold;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }

    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    margin-bottom: 1rem;
`;

const GroupList = styled.ul`
    list-style: none;
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    padding: 0.5rem;
    flex-grow: 1; /* Allow list to take up available space */
`;

const GroupItem = styled.li`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    &:hover {
        background-color: ${({ theme }) => theme.background};
    }
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
    width: 18px;
    height: 18px;
    flex-shrink: 0;
`;

const BatchCreationContainer = styled.div`
    margin-top: 1.5rem;
    padding-top: 1.5rem;
    border-top: 1px solid ${({ theme }) => theme.border};
`;

const BatchInput = styled.input`
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    margin-bottom: 0.5rem;
`;

const SaveButton = styled.button`
    width: 100%;
    background-color: ${({ theme, disabled }) => disabled ? theme.lightText : theme.primary};
    color: white;
    border: none;
    padding: 0.6rem 1rem;
    border-radius: 4px;
    cursor: ${({ disabled }) => disabled ? 'not-allowed' : 'pointer'};
    font-weight: bold;
`;

const CancelButton = styled.button`
    width: 100%;
    margin-top: 0.5rem;
    background-color: transparent;
    border: 1px solid ${({ theme }) => theme.lightText};
    color: ${({ theme }) => theme.lightText};
    padding: 0.6rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    
    &:hover {
        background-color: ${({ theme }) => theme.background};
    }
`;


const GroupSelector = ({ allGroups, selectedGroups, setSelectedGroups, onBatchUpdate, editingBatch, setEditingBatch, onSync, isSyncing }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [batchName, setBatchName] = useState('');
    
    const isEditMode = editingBatch !== null;

    useEffect(() => {
        if (isEditMode) {
            setBatchName(editingBatch.name);
        } else {
            setBatchName('');
        }
    }, [editingBatch, isEditMode]);

    const handleSelect = (groupId) => {
        const newSelectedGroups = new Set(selectedGroups);
        if (newSelectedGroups.has(groupId)) {
            newSelectedGroups.delete(groupId);
        } else {
            newSelectedGroups.add(groupId);
        }
        setSelectedGroups(newSelectedGroups);
    };

    const handleSaveOrUpdateBatch = async () => {
        if (!batchName || selectedGroups.size === 0) {
            alert('Please enter a batch name and select at least one group.');
            return;
        }
        
        const batchData = { name: batchName, groupIds: Array.from(selectedGroups) };

        try {
            if (isEditMode) {
                await updateBatch(editingBatch.id, batchData);
                alert(`Batch "${batchName}" updated successfully!`);
            } else {
                await createBatch(batchData);
                alert(`Batch "${batchName}" saved successfully!`);
            }
            setBatchName('');
            setEditingBatch(null);
            onBatchUpdate();
        } catch (error) {
            console.error('Error saving/updating batch:', error);
            alert('Failed to save batch.');
        }
    };
    
    const cancelEdit = () => {
        setEditingBatch(null);
        setSelectedGroups(new Set());
    };

    // --- SORTING AND FILTERING LOGIC ---
    const sortedAndFilteredGroups = useMemo(() => {
        // First, filter by the search term
        const filtered = (allGroups || []).filter(g =>
            g.name && g.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        // Then, sort the filtered list
        return filtered.sort((a, b) => {
            const aIsSelected = selectedGroups.has(a.id);
            const bIsSelected = selectedGroups.has(b.id);

            if (aIsSelected && !bIsSelected) {
                return -1; // a comes first
            }
            if (!aIsSelected && bIsSelected) {
                return 1; // b comes first
            }
            return 0; // maintain original order if both are selected or not selected
        });
    }, [allGroups, searchTerm, selectedGroups]);


    return (
        <Container>
            <HeaderContainer>
                <h3>Select Groups ({selectedGroups.size} selected)</h3>
                <SyncButton onClick={onSync} disabled={isSyncing}>
                    <FaSyncAlt className={isSyncing ? 'spin' : ''} />
                    {isSyncing ? 'Syncing...' : 'Sync Groups'}
                </SyncButton>
            </HeaderContainer>

            <SearchInput
                type="text"
                placeholder="Search groups..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
            <GroupList>
                {sortedAndFilteredGroups.map(group => (
                    <GroupItem key={group.id} onClick={() => handleSelect(group.id)}>
                        <Checkbox
                            readOnly
                            checked={selectedGroups.has(group.id)}
                        />
                        <span>{group.name}</span>
                    </GroupItem>
                ))}
            </GroupList>

            <BatchCreationContainer>
                <h4>{isEditMode ? `Editing: ${editingBatch.name}` : 'Create New Batch'}</h4>
                <BatchInput
                    type="text"
                    placeholder="Batch name..."
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                />
                <SaveButton
                    disabled={!batchName || selectedGroups.size === 0}
                    onClick={handleSaveOrUpdateBatch}
                >
                    {isEditMode ? 'Update Batch' : `Save ${selectedGroups.size} Groups as Batch`}
                </SaveButton>
                {isEditMode && (
                    <CancelButton onClick={cancelEdit}>
                        Cancel Edit
                    </CancelButton>
                )}
            </BatchCreationContainer>
        </Container>
    );
};

export default GroupSelector;