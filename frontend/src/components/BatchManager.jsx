import React, { useState, useMemo } from 'react';
import styled from 'styled-components';
import { FaLayerGroup, FaEdit, FaTrash } from 'react-icons/fa';
import { deleteBatch } from '../services/api';

const Container = styled.div`
    background: #fff;
    padding: 1.5rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
`;

const Title = styled.h3`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
`;

const SearchInput = styled.input`
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    margin-bottom: 1rem;
`;

const BatchList = styled.ul`
    list-style: none;
    max-height: 250px;
    overflow-y: auto;
`;

const BatchItem = styled.li`
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 500;
    &:hover {
        background-color: ${({ theme }) => theme.background};
    }
`;

const ItemName = styled.span`
    flex-grow: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ActionsContainer = styled.div`
    display: flex;
    gap: 0.75rem;
    color: ${({ theme }) => theme.lightText};
    padding-left: 1rem;
    
    svg {
        cursor: pointer;
        &:hover {
            color: ${({ theme }) => theme.primary};
        }
    }
`;

// 1. ACCEPT THE NEW PERMISSION PROP
const BatchManager = ({ batches, onBatchSelect, onBatchEdit, onBatchesUpdate, canEditBatch, canDeleteBatch }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const handleDelete = async (batchId, batchName) => {
        if (window.confirm(`Are you sure you want to delete the batch "${batchName}"?`)) {
            try {
                await deleteBatch(batchId);
                alert('Batch deleted successfully.');
                onBatchesUpdate();
            } catch (error) {
                console.error('Failed to delete batch:', error);
                alert('Failed to delete batch.');
            }
        }
    };
    
    const filteredBatches = useMemo(() => {
        return (batches || []).filter(batch => 
            batch.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [batches, searchTerm]);

    return (
        <Container>
            <Title><FaLayerGroup /> Select Batch</Title>
            <SearchInput
                type="text"
                placeholder="Search batches..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
            <BatchList>
                <BatchItem onClick={() => onBatchSelect(null)}>
                    <ItemName>-- Clear Selection --</ItemName>
                </BatchItem>
                {filteredBatches.map(batch => (
                    <BatchItem key={batch.id} onClick={() => onBatchSelect(batch.id)}>
                        <ItemName title={batch.name}>
                            {batch.name}
                        </ItemName>
                        {/* 2. WRAP THE ACTIONS IN A PERMISSION CHECK */}
                        {(canEditBatch || canDeleteBatch) && (
                            <ActionsContainer>
                                {canEditBatch && <FaEdit onClick={(e) => { e.stopPropagation(); onBatchEdit(batch); }} title="Edit"/>}
                                {canDeleteBatch && <FaTrash onClick={(e) => { e.stopPropagation(); handleDelete(batch.id, batch.name); }} title="Delete"/>}
                            </ActionsContainer>
                        )}
                    </BatchItem>
                ))}
            </BatchList>
        </Container>
    );
};

export default BatchManager;
