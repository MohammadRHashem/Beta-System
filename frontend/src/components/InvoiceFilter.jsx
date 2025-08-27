import React from 'react';
import styled from 'styled-components';

const FilterContainer = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
    align-items: flex-end;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 500;
    font-size: 0.85rem;
`;

const Input = styled.input`
    padding: 0.6rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 0.9rem;
`;

const Select = styled.select`
    padding: 0.6rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 0.9rem;
    background: white;
`;

const ClearButton = styled.button`
    padding: 0.6rem 1rem;
    border: 1px solid ${({ theme }) => theme.lightText};
    color: ${({ theme }) => theme.lightText};
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    
    &:hover {
        background: ${({ theme }) => theme.background};
    }
`;

const InvoiceFilter = ({ filters, onFilterChange, allGroups, recipientNames }) => {

    const handleChange = (e) => {
        onFilterChange({ ...filters, [e.target.name]: e.target.value });
    };
    
    const handleClear = () => {
        onFilterChange({
            search: '', dateFrom: '', dateTo: '',
            sourceGroup: '', recipientName: '', reviewStatus: '',
        });
    };

    return (
        <FilterContainer>
            <InputGroup>
                <Label>Search</Label>
                <Input
                    name="search"
                    type="text"
                    placeholder="Transaction ID, name, notes..."
                    value={filters.search}
                    onChange={handleChange}
                />
            </InputGroup>
            <InputGroup>
                <Label>From Date</Label>
                <Input
                    name="dateFrom"
                    type="date"
                    value={filters.dateFrom}
                    onChange={handleChange}
                />
            </InputGroup>
            <InputGroup>
                <Label>To Date</Label>
                <Input
                    name="dateTo"
                    type="date"
                    value={filters.dateTo}
                    onChange={handleChange}
                />
            </InputGroup>
            <InputGroup>
                <Label>Source Group</Label>
                <Select name="sourceGroup" value={filters.sourceGroup} onChange={handleChange}>
                    <option value="">All Groups</option>
                    {allGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                </Select>
            </InputGroup>
            <InputGroup>
                <Label>Recipient Name</Label>
                <Select name="recipientName" value={filters.recipientName} onChange={handleChange}>
                    <option value="">All Recipients</option>
                    {recipientNames.map(name => <option key={name} value={name}>{name}</option>)}
                </Select>
            </InputGroup>
            <InputGroup>
                <Label>Review Status</Label>
                <Select name="reviewStatus" value={filters.reviewStatus} onChange={handleChange}>
                    <option value="">Show All</option>
                    <option value="only_review">Show Only To Be Reviewed</option>
                    <option value="hide_review">Hide "To Be Reviewed"</option>
                </Select>
            </InputGroup>
            <ClearButton onClick={handleClear}>Clear Filters</ClearButton>
        </FilterContainer>
    );
};

export default InvoiceFilter;