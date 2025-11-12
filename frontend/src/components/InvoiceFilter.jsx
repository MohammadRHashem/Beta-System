import React from 'react';
import styled from 'styled-components';
import Select from 'react-select';

const FilterContainer = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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

const selectStyles = {
  control: (provided) => ({
    ...provided,
    minHeight: '40px',
  }),
  menu: (provided) => ({
    ...provided,
    zIndex: 20
  })
};

const InvoiceFilter = ({ filters, onFilterChange, allGroups, recipientNames }) => {

    const handleMultiChange = (name, selectedOptions) => {
        const values = selectedOptions ? selectedOptions.map(opt => opt.value) : [];
        onFilterChange({ ...filters, [name]: values });
    };

    const handleChange = (e) => {
        onFilterChange({ ...filters, [e.target.name]: e.target.value });
    };
    
    const handleClear = () => {
        onFilterChange({
            search: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
            sourceGroups: [], recipientNames: [],
            reviewStatus: '', status: '',
        });
    };

    const groupOptions = allGroups.map(g => ({ value: g.id, label: g.name }));
    const recipientOptions = recipientNames.map(name => ({ value: name, label: name }));

    return (
        <FilterContainer>
            <InputGroup>
                <Label>Search (ID, Name, Amount, etc.)</Label> {/* <-- Reverted Label */}
                <Input name="search" type="text" value={filters.search} onChange={handleChange} />
            </InputGroup>
            <InputGroup>
                <Label>From Date</Label>
                <Input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleChange} />
            </InputGroup>
            <InputGroup>
                <Label>From Time</Label>
                <Input name="timeFrom" type="time" value={filters.timeFrom} onChange={handleChange} />
            </InputGroup>
            <InputGroup>
                <Label>To Date</Label>
                <Input name="dateTo" type="date" value={filters.dateTo} onChange={handleChange} />
            </InputGroup>
            <InputGroup>
                <Label>To Time</Label>
                <Input name="timeTo" type="time" value={filters.timeTo} onChange={handleChange} />
            </InputGroup>

            <InputGroup>
                <Label>Source Groups</Label>
                <Select
                    isMulti
                    options={groupOptions}
                    styles={selectStyles}
                    onChange={(opts) => handleMultiChange('sourceGroups', opts)}
                    value={groupOptions.filter(opt => filters.sourceGroups.includes(opt.value))}
                />
            </InputGroup>

            <InputGroup>
                <Label>Recipient Names</Label>
                <Select
                    isMulti
                    options={recipientOptions}
                    styles={selectStyles}
                    onChange={(opts) => handleMultiChange('recipientNames', opts)}
                    value={recipientOptions.filter(opt => filters.recipientNames.includes(opt.value))}
                />
            </InputGroup>

            <InputGroup>
                <Label>Review Status</Label>
                <select name="reviewStatus" value={filters.reviewStatus} onChange={handleChange} style={{height: '40px', border: '1px solid hsl(0, 0%, 80%)', borderRadius: '4px'}}>
                    <option value="">Show All</option>
                    <option value="only_review">Show Only To Be Reviewed</option>
                    <option value="hide_review">Hide "To Be Reviewed"</option>
                </select>
            </InputGroup>
            
            <InputGroup>
                <Label>Other Status</Label>
                <select name="status" value={filters.status} onChange={handleChange} style={{height: '40px', border: '1px solid hsl(0, 0%, 80%)', borderRadius: '4px'}}>
                    <option value="">Show All</option>
                    <option value="only_deleted">Show Only Deleted</option>
                    <option value="only_duplicates">Show Only Duplicates</option>
                </select>
            </InputGroup>

            <ClearButton onClick={handleClear}>Clear Filters</ClearButton>
        </FilterContainer>
    );
};

export default InvoiceFilter;