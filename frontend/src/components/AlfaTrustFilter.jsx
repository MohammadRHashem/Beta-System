import React from 'react';
import styled from 'styled-components';
import { format } from 'date-fns';

const FilterContainer = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem 1.5rem;
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
        padding: 0.75rem;
        border: 1px solid ${({ theme }) => theme.border};
        border-radius: 4px;
        font-size: 0.9rem;
        width: 100%;
        background: #fff;
    }
`;

const ClearButton = styled.button`
    padding: 0.75rem 1rem;
    border: 1px solid ${({ theme }) => theme.lightText};
    color: ${({ theme }) => theme.lightText};
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    height: 45px; /* Align with inputs */
    
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

    // === MODIFICATION 1: Update clear function for date range ===
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
            
            {/* === MODIFICATION 2: Add two date inputs === */}
            <InputGroup>
                <label>Date From</label>
                <input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleChange} />
            </InputGroup>
            
            <InputGroup>
                <label>Date To</label>
                <input name="dateTo" type="date" value={filters.dateTo} onChange={handleChange} />
            </InputGroup>
            {/* ========================================= */}
            
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