import React from 'react';
import styled from 'styled-components';
import { format } from 'date-fns';

const FilterContainer = styled.div`
    background: ${({ theme }) => theme.surface};
    padding: 1.05rem 1.15rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadowMd};
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 0.85rem;
    align-items: flex-end;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;

    label {
        font-weight: 500;
        font-size: 0.85rem;
    }

    input, select {
        padding: 0.62rem 0.72rem;
        border: 1px solid ${({ theme }) => theme.border};
        border-radius: 8px;
        font-size: 0.9rem;
        width: 100%;
        background: ${({ theme }) => theme.surface};
    }
`;

const ClearButton = styled.button`
    padding: 0.62rem 0.8rem;
    border: 1px solid ${({ theme }) => theme.lightText};
    color: ${({ theme }) => theme.lightText};
    background: transparent;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;
    height: 40px;
    
    &:hover {
        background: ${({ theme }) => theme.background};
        color: ${({ theme }) => theme.primary};
        border-color: ${({ theme }) => theme.primary};
    }
`;

const AlfaTrustFilter = ({ filters, onFilterChange }) => {
    const handleChange = (e) => {
        onFilterChange({ ...filters, [e.target.name]: e.target.value });
    };

    const handleClear = () => {
        const today = format(new Date(), 'yyyy-MM-dd');
        onFilterChange({ 
            search: '', 
            dateFrom: today, // <-- Set both dates to today
            dateTo: today,
            operation: '' 
        });
    };

    return (
        <FilterContainer>
            <InputGroup>
                <label>Search (ID, Name, Amount)</label>
                <input name="search" type="text" value={filters.search} onChange={handleChange} />
            </InputGroup>
            
            <InputGroup>
                <label>Date From</label>
                <input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleChange} />
            </InputGroup>
            
            <InputGroup>
                <label>Date To</label>
                <input name="dateTo" type="date" value={filters.dateTo} onChange={handleChange} />
            </InputGroup>
            
            <InputGroup>
                <label>Operation</label>
                <select name="operation" value={filters.operation} onChange={handleChange}>
                    <option value="">All Operations</option>
                    <option value="C">Credit (In)</option>
                    <option value="D">Debit (Out)</option>
                </select>
            </InputGroup>
            <ClearButton onClick={handleClear}>Clear Filters</ClearButton>
        </FilterContainer>
    );
};

export default AlfaTrustFilter;
