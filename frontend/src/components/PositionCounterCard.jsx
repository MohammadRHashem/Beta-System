import React from 'react';
import styled from 'styled-components';
import { format } from 'date-fns';
import { FaCalendarAlt, FaEdit, FaSyncAlt, FaTrash } from 'react-icons/fa';

const formatMoney = (value) => new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(Number(value || 0));

const Card = styled.article`
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1.15rem;
    border-radius: 18px;
    background:
        linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0)),
        ${({ theme }) => theme.surface};
    border: 1px solid ${({ theme }) => theme.border};
    box-shadow: ${({ theme }) => theme.shadowMd};
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 0.75rem;
`;

const TitleWrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
`;

const Title = styled.h3`
    margin: 0;
    color: ${({ theme }) => theme.primary};
    font-size: 1.08rem;
`;

const Subtext = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.92rem;
`;

const BadgeRow = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
`;

const Badge = styled.span`
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.4rem 0.65rem;
    border-radius: 999px;
    background: ${({ $tone, theme }) => (
        $tone === 'strong'
            ? theme.secondary
            : theme.background
    )};
    color: ${({ $tone, theme }) => ($tone === 'strong' ? 'white' : theme.lightText)};
    font-size: 0.78rem;
    font-weight: 700;
`;

const Actions = styled.div`
    display: flex;
    align-items: center;
    gap: 0.35rem;
    flex-wrap: wrap;
`;

const IconButton = styled.button`
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.lightText};
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
        color: ${({ theme }) => theme.primary};
        border-color: ${({ theme }) => theme.primary};
    }
`;

const FilterBlock = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
`;

const FilterLabel = styled.label`
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.84rem;
    font-weight: 700;
    color: ${({ theme }) => theme.lightText};
`;

const DateInput = styled.input`
    width: 100%;
    padding: 0.74rem 0.8rem;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.border};
    font-size: 0.96rem;
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
`;

const ValueWrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 6rem;
    justify-content: center;
`;

const ValueLabel = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.88rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
`;

const Value = styled.p`
    margin: 0;
    font-size: 2.2rem;
    line-height: 1;
    font-weight: 800;
    color: ${({ theme }) => theme.primary};
`;

const MetaGrid = styled.div`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
`;

const MetaCard = styled.div`
    padding: 0.75rem 0.8rem;
    border-radius: 12px;
    background: ${({ theme }) => theme.background};
    border: 1px solid ${({ theme }) => theme.border};
`;

const MetaLabel = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
`;

const MetaValue = styled.p`
    margin: 0.25rem 0 0;
    color: ${({ theme }) => theme.text};
    font-weight: 700;
    font-size: 1rem;
`;

const Footer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.82rem;
`;

const ErrorBox = styled.div`
    padding: 0.8rem;
    border-radius: 12px;
    background: rgba(220, 53, 69, 0.08);
    color: #b42318;
    border: 1px solid rgba(220, 53, 69, 0.18);
    font-weight: 600;
`;

const PositionCounterCard = ({
    counter,
    dateTo,
    value,
    loading,
    error,
    lastUpdatedAt,
    canManage,
    onDateChange,
    onRefresh,
    onEdit,
    onDelete,
}) => {
    const displayDate = dateTo || '';
    const formattedLastUpdated = lastUpdatedAt ? format(new Date(lastUpdatedAt), 'HH:mm:ss') : 'Never';

    return (
        <Card>
            <Header>
                <TitleWrap>
                    <Title>{counter.name}</Title>
                    <Subtext>{counter.subaccount_name || 'Invoice portal subaccount'}</Subtext>
                    <BadgeRow>
                        <Badge $tone="strong">{String(counter.account_type || '').toUpperCase()}</Badge>
                        <Badge>Invoices</Badge>
                        <Badge>Saldo total</Badge>
                    </BadgeRow>
                </TitleWrap>
                <Actions>
                    <IconButton type="button" onClick={() => onRefresh(counter.id)} title="Refresh">
                        <FaSyncAlt />
                    </IconButton>
                    {canManage ? (
                        <>
                            <IconButton type="button" onClick={() => onEdit(counter)} title="Edit counter">
                                <FaEdit />
                            </IconButton>
                            <IconButton type="button" onClick={() => onDelete(counter)} title="Delete counter">
                                <FaTrash />
                            </IconButton>
                        </>
                    ) : null}
                </Actions>
            </Header>

            <FilterBlock>
                <FilterLabel>
                    <FaCalendarAlt /> Date To (Until)
                </FilterLabel>
                <DateInput
                    type="date"
                    value={displayDate}
                    onChange={(event) => onDateChange(counter.id, event.target.value)}
                />
            </FilterBlock>

            {error ? <ErrorBox>{error}</ErrorBox> : null}

            <ValueWrap>
                <ValueLabel>{loading ? 'Refreshing...' : 'Saldo Total'}</ValueLabel>
                <Value>{loading && !value ? '...' : formatMoney(value?.balance || 0)}</Value>
                <Subtext>
                    Matching the portal ledger balance until {displayDate || 'today'}.
                </Subtext>
            </ValueWrap>

            <MetaGrid>
                <MetaCard>
                    <MetaLabel>Statement</MetaLabel>
                    <MetaValue>{formatMoney(value?.statementBalance || 0)}</MetaValue>
                </MetaCard>
                <MetaCard>
                    <MetaLabel>Manual</MetaLabel>
                    <MetaValue>{formatMoney(value?.manualBalance || 0)}</MetaValue>
                </MetaCard>
            </MetaGrid>

            <Footer>
                <span>Updated: {formattedLastUpdated}</span>
                <span>Subaccount #{counter.subaccount_id}</span>
            </Footer>
        </Card>
    );
};

export default PositionCounterCard;
