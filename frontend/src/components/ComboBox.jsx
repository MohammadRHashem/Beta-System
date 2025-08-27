import React, { useState, useMemo, useRef, useEffect } from 'react';
import styled from 'styled-components';
import { FaChevronDown } from 'react-icons/fa';

const Wrapper = styled.div`
    position: relative;
    width: 100%;
`;

const InputContainer = styled.div`
    position: relative;
    display: flex;
    align-items: center;
    background: #fff;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    padding-right: 0.5rem;
    &:focus-within {
        border-color: ${({ theme }) => theme.primary};
        box-shadow: 0 0 0 1px ${({ theme }) => theme.primary};
    }
`;

const Input = styled.input`
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: 4px;
    font-size: 1rem;
    outline: none;
`;

const Dropdown = styled.ul`
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    width: 100%;
    background: #fff;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
`;

const DropdownItem = styled.li`
    padding: 0.75rem;
    cursor: pointer;
    &:hover, &.selected {
        background-color: ${({ theme }) => theme.background};
    }
`;

const ComboBox = ({ options, value, onChange, placeholder }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);

    const selectedOptionName = useMemo(() => {
        return options.find(opt => opt.id === value)?.name || '';
    }, [options, value]);

    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options;
        return options.filter(opt =>
            opt.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [options, searchTerm]);
    
    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [wrapperRef]);
    
    const handleSelect = (optionId) => {
        onChange({ target: { value: optionId } }); // Mimic event object
        const selectedName = options.find(opt => opt.id === optionId)?.name || '';
        setSearchTerm(selectedName);
        setIsOpen(false);
    };

    const handleInputChange = (e) => {
        setSearchTerm(e.target.value);
        if (!isOpen) setIsOpen(true);
        if (e.target.value === '') {
             onChange({ target: { value: '' } });
        }
    };
    
    return (
        <Wrapper ref={wrapperRef}>
            <InputContainer>
                <Input
                    type="text"
                    value={isOpen ? searchTerm : selectedOptionName}
                    onChange={handleInputChange}
                    onFocus={() => setIsOpen(true)}
                    placeholder={placeholder}
                />
                <FaChevronDown color="#ccc" />
            </InputContainer>
            {isOpen && (
                <Dropdown>
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map(option => (
                            <DropdownItem
                                key={option.id}
                                onClick={() => handleSelect(option.id)}
                                className={value === option.id ? 'selected' : ''}
                            >
                                {option.name}
                            </DropdownItem>
                        ))
                    ) : (
                        <DropdownItem as="div">No results found</DropdownItem>
                    )}
                </Dropdown>
            )}
        </Wrapper>
    );
};

export default ComboBox;