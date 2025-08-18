import React from 'react';
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

// THIS IS THE MISSING PIECE OF CODE THAT CAUSED THE ERROR
const ItemName = styled.span`
    flex-grow: 1;
    /* Add these for better text handling on long names */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
`;

const ActionsContainer = styled.div`
    display: flex;
    gap: 0.75rem;
    color: ${({ theme }) => theme.lightText};
    padding-left: 1rem; /* Add some space so icons don't touch text */
    
    svg {
        &:hover {
            color: ${({ theme }) => theme.primary};
        }
    }
`;

const BatchManager = ({ batches, onBatchSelect, onBatchEdit, onBatchesUpdate }) => {
    
    const handleDelete = async (batchId, batchName) => {
        if (window.confirm(`Are you sure you want to delete the batch "${batchName}"?`)) {
            try {
                await deleteBatch(batchId);
                alert('Batch deleted successfully.');
                onBatchesUpdate(); // Refresh the list in App.jsx
            } catch (error) {
                console.error('Failed to delete batch:', error);
                alert('Failed to delete batch.');
            }
        }
    };
    
    return (
        <Container>
            <Title><FaLayerGroup /> Select Batch</Title>
            <BatchList>
                <BatchItem onClick={() => onBatchSelect(null)}>
                    <ItemName>-- Clear Selection --</ItemName>
                </BatchItem>
                {(batches || []).map(batch => (
                    <BatchItem key={batch.id}>
                        <ItemName onClick={() => onBatchSelect(batch.id)} title={batch.name}>
                            {batch.name}
                        </ItemName>
                        <ActionsContainer>
                            <FaEdit onClick={(e) => { e.stopPropagation(); onBatchEdit(batch); }} />
                            <FaTrash onClick={(e) => { e.stopPropagation(); handleDelete(batch.id, batch.name); }} />
                        </ActionsContainer>
                    </BatchItem>
                ))}
            </BatchList>
        </Container>
    );
};

export default BatchManager;