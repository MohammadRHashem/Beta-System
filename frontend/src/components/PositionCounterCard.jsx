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
    gap: 0.8rem;
    padding: 0.95rem;
    border-radius: 16px;
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
    font-size: 1rem;
`;

const Subtext = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.84rem;
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
    font-size: 0.72rem;
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
    border-radius: 9px;
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
    gap: 0.35rem;
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
    padding: 0.65rem 0.72rem;
    border-radius: 9px;
    border: 1px solid ${({ theme }) => theme.border};
    font-size: 0.92rem;
    background: ${({ theme }) => theme.background};
    color: ${({ theme }) => theme.text};
`;

const ValueWrap = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 3.5rem;
    justify-content: center;
`;

const ValueLabel = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
`;

const Value = styled.p`
    margin: 0;
    font-size: 1.7rem;
    line-height: 1;
    font-weight: 800;
    color: ${({ theme }) => theme.primary};
`;

const MetricGrid = styled.div`
    display: grid;
    gap: 0.65rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));

    @media (max-width: 900px) {
        grid-template-columns: 1fr;
    }
`;

const MetricCard = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    padding: 0.8rem 0.85rem;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.border};
    background:
        linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0)),
        ${({ theme }) => theme.background};
    min-height: 7rem;
    justify-content: center;
`;

const MetricLabel = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 700;
`;

const MetricValue = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.primary};
    font-size: 1.35rem;
    line-height: 1.1;
    font-weight: 800;
`;

const MetricMeta = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.78rem;
    line-height: 1.4;
`;

const Footer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.76rem;
`;

const ErrorBox = styled.div`
    padding: 0.8rem;
    border-radius: 12px;
    background: rgba(220, 53, 69, 0.08);
    color: #b42318;
    border: 1px solid rgba(220, 53, 69, 0.18);
    font-weight: 600;
`;

const SecondaryMetric = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.65rem 0.75rem;
    border-radius: 12px;
    border: 1px solid ${({ theme }) => theme.border};
    background: ${({ theme }) => theme.background};
`;

const SecondaryLabel = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.74rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 700;
`;

const SecondaryValue = styled.p`
    margin: 0;
    color: ${({ theme }) => theme.text};
    font-size: 1rem;
    font-weight: 800;
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
    const helperText = `From last saldo inicial until ${displayDate || 'today'}.`;
    const isCrossCounter = counter.account_type === 'cross';

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

            {isCrossCounter ? (
                <MetricGrid>
                    <MetricCard>
                        <MetricLabel>{loading ? 'Refreshing...' : 'Saldo Until Date'}</MetricLabel>
                        <MetricValue>{loading && !value ? '...' : formatMoney(value?.invoiceUntilDate || 0)}</MetricValue>
                        <MetricMeta>{helperText}</MetricMeta>
                    </MetricCard>
                    <MetricCard>
                        <MetricLabel>{loading ? 'Refreshing...' : 'Saldo Until Date + Chaves'}</MetricLabel>
                        <MetricValue>{loading && !value ? '...' : formatMoney(value?.balance || 0)}</MetricValue>
                        <MetricMeta>
                            Invoice balance plus Cross transaction-source contribution.
                        </MetricMeta>
                    </MetricCard>
                    <MetricCard>
                        <MetricLabel>{loading ? 'Refreshing...' : 'Chave Pix Saldo Total'}</MetricLabel>
                        <MetricValue>{loading && !value ? '...' : formatMoney(value?.chavePixSaldoTotal || 0)}</MetricValue>
                        <MetricMeta>
                            {Number(value?.chavePixIncludedCount || 0)} transaction-source Cross subaccounts included.
                        </MetricMeta>
                    </MetricCard>
                </MetricGrid>
            ) : (
                <ValueWrap>
                    <ValueLabel>{loading ? 'Refreshing...' : 'Saldo Until Date'}</ValueLabel>
                    <Value>{loading && !value ? '...' : formatMoney(value?.balance || 0)}</Value>
                    <Subtext>{helperText}</Subtext>
                </ValueWrap>
            )}

            <Footer>
                <span>Updated: {formattedLastUpdated}</span>
                <span>Subaccount #{counter.subaccount_id}</span>
            </Footer>
        </Card>
    );
};

export default PositionCounterCard;
