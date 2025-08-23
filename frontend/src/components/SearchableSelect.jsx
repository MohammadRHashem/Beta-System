import React, { useState, useMemo } from 'react';
import styled from 'styled-components';

const Container = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-grow: 1;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const Select = styled.select`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const SearchableSelect = ({ options, value, onChange, placeholder, searchPlaceholder }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredOptions = useMemo(() => {
        return (options || []).filter(option =>
            option.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [options, searchTerm]);

    return (
        <Container>
            <Input 
                type="text" 
                placeholder={searchPlaceholder || "Search..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
            <Select value={value} onChange={onChange} required>
                <option value="" disabled>{placeholder || "Select an option"}</option>
                {filteredOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                ))}
            </Select>
        </Container>
    );
};

export default SearchableSelect;