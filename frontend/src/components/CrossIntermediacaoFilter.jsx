import React from 'react';
import styled from 'styled-components';
import { FaBroom, FaSearch, FaSyncAlt } from 'react-icons/fa';

const FilterCard = styled.div`
    background: #fff;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
`;

const TopRow = styled.div`
    display: grid;
    grid-template-columns: 2.2fr 1fr 1fr;
    gap: 0.85rem;

    @media (max-width: 1100px) {
        grid-template-columns: 1fr;
    }
`;

const DateRow = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr 1fr 1fr;
    gap: 0.85rem;

    @media (max-width: 1100px) {
        grid-template-columns: 1fr 1fr;
    }
`;

const Field = styled.label`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    font-size: 0.82rem;
    font-weight: 600;
    color: ${({ theme }) => theme.lightText};
`;

const BaseInput = styled.input`
    width: 100%;
    padding: 0.68rem 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    font-size: 0.9rem;
    background: #fff;
`;

const Select = styled.select`
    width: 100%;
    padding: 0.68rem 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    font-size: 0.9rem;
    background: #fff;
`;

const SearchWrap = styled.div`
    position: relative;
`;

const SearchIcon = styled(FaSearch)`
    position: absolute;
    left: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.85rem;
    color: ${({ theme }) => theme.lightText};
`;

const SearchInput = styled(BaseInput)`
    padding-left: 2rem;
`;

const Actions = styled.div`
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
`;

const ActionButton = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border-radius: 6px;
    padding: 0.62rem 0.95rem;
    font-size: 0.86rem;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid ${({ theme, variant }) => variant === 'ghost' ? theme.border : 'transparent'};
    background: ${({ theme, variant }) => variant === 'ghost' ? '#fff' : theme.primary};
    color: ${({ theme, variant }) => variant === 'ghost' ? theme.lightText : '#fff'};

    &:hover {
        opacity: 0.92;
    }
`;

const CrossIntermediacaoFilter = ({ filters, onFilterChange, onClear, onRefresh }) => {
    const handleChange = (event) => {
        const { name, value } = event.target;
        onFilterChange({ ...filters, [name]: value });
    };

    return (
        <FilterCard>
            <TopRow>
                <Field>
                    Smart Search
                    <SearchWrap>
                        <SearchIcon />
                        <SearchInput
                            name="search"
                            type="text"
                            value={filters.search}
                            onChange={handleChange}
                            placeholder="e2e, payer name, payer id, uid, pix key, amount..."
                        />
                    </SearchWrap>
                </Field>

                <Field>
                    Direction
                    <Select name="txType" value={filters.txType} onChange={handleChange}>
                        <option value="">All</option>
                        <option value="C">C (In)</option>
                        <option value="D">D (Out)</option>
                    </Select>
                </Field>

                <Field>
                    Link Status
                    <Select name="linkStatus" value={filters.linkStatus} onChange={handleChange}>
                        <option value="all">All</option>
                        <option value="linked">Linked</option>
                        <option value="unlinked">Unlinked</option>
                    </Select>
                </Field>
            </TopRow>

            <DateRow>
                <Field>
                    Date From
                    <BaseInput
                        name="dateFrom"
                        type="date"
                        value={filters.dateFrom}
                        onChange={handleChange}
                    />
                </Field>

                <Field>
                    Time From
                    <BaseInput
                        name="timeFrom"
                        type="time"
                        value={filters.timeFrom}
                        onChange={handleChange}
                    />
                </Field>

                <Field>
                    Date To
                    <BaseInput
                        name="dateTo"
                        type="date"
                        value={filters.dateTo}
                        onChange={handleChange}
                    />
                </Field>

                <Field>
                    Time To
                    <BaseInput
                        name="timeTo"
                        type="time"
                        value={filters.timeTo}
                        onChange={handleChange}
                    />
                </Field>
            </DateRow>

            <Actions>
                <ActionButton type="button" variant="ghost" onClick={onClear}>
                    <FaBroom /> Clear
                </ActionButton>
                <ActionButton type="button" onClick={onRefresh}>
                    <FaSyncAlt /> Refresh
                </ActionButton>
            </Actions>
        </FilterCard>
    );
};

export default CrossIntermediacaoFilter;
