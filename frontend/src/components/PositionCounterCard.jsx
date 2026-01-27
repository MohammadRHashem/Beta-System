import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { calculateLocalPosition, calculateRemotePosition } from '../services/api';
import { format } from 'date-fns';
import { FaEdit, FaTrash, FaSyncAlt } from 'react-icons/fa';

const Card = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    border-top: 4px solid ${({ theme }) => theme.secondary};
    position: relative;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
`;

const Title = styled.h3`
    margin: 0;
    color: ${({ theme }) => theme.primary};
`;

const Actions = styled.div`
    display: flex;
    gap: 1rem;
    color: ${({ theme }) => theme.lightText};
    font-size: 1rem;
    
    svg {
        cursor: pointer;
        &:hover {
            color: ${({ theme }) => theme.primary};
        }
    }
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
`;

const Label = styled.label`
    font-weight: 600;
    font-size: 0.9rem;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const ResultContainer = styled.div`
    text-align: center;
    padding: 1rem 0;
`;

const ResultLabel = styled.p`
    font-size: 1rem;
    color: ${({ theme }) => theme.lightText};
    margin: 0.25rem 0 0 0;
`;

const CalculationPeriod = styled.p`
    font-size: 0.8rem;
    color: #888;
    margin-top: 1.5rem;
    background-color: ${({ theme }) => theme.background};
    padding: 0.5rem;
    border-radius: 4px;
`;

const SpinIcon = styled(FaSyncAlt)`
    animation: spin 1s linear infinite;
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;

const ResultValue = styled.p`
    font-size: 2.2rem; // Slightly smaller to fit better
    font-weight: 700;
    color: ${({ theme }) => theme.primary};
    margin: 0;
`;
const LastUpdated = styled.p`
    font-size: 0.75rem;
    color: #aaa;
    position: absolute;
    bottom: 0.5rem;
    right: 1.5rem;
`;

const PositionCounterCard = ({ counter, onEdit, onDelete, canManage }) => {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);

    const handleCalculate = useCallback(async (isRefresh = false) => {
        setLoading(true);
        setError('');
        try {
            let data;
            if (counter.type === 'local') {
                ({ data } = await calculateLocalPosition({ date: selectedDate, keyword: counter.keyword }));
            
            // === THIS IS THE CORRECTED LINE ===
            } else if (counter.type === 'remote') { 
            // ===================================
                
                // For a manual refresh of any remote counter, we fetch today's data.
                const dateParam = isRefresh ? null : selectedDate;
                ({ data } = await calculateRemotePosition(counter.id, { date: dateParam }));
                setLastUpdated(new Date());
            }
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to calculate position.');
            setResult(null);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, counter]);

    // Initial calculation and on date change
    useEffect(() => {
        handleCalculate();
    }, [handleCalculate]);

    // Auto-refresh for remote counters
    useEffect(() => {
        if (counter.type === 'remote') {
            const interval = setInterval(() => handleCalculate(true), 60000); // 1 minute
            return () => clearInterval(interval);
        }
    }, [counter.type, handleCalculate]);
    
    const formatDisplayDateTime = (isoString) => format(new Date(isoString), 'MMM dd, HH:mm:ss');
    const formatMoney = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(value);

    return (
        <Card>
            <Header>
                <Title>{counter.name}</Title>
                {canManage && (
                    <Actions>
                        {counter.type === 'remote' && <FaSyncAlt onClick={() => handleCalculate(true)} title="Refresh Now" />}
                        <FaEdit onClick={() => onEdit(counter)} title="Edit Counter" />
                        <FaTrash onClick={() => onDelete(counter)} title="Delete Counter" />
                    </Actions>
                )}
            </Header>

            <InputGroup>
                <Label>{counter.type === 'local' ? 'Select Business Day' : 'Select Date for Historical Balance'}</Label>
                <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
            </InputGroup>

            <ResultContainer>
                {loading ? <SpinIcon size="2rem" color="#ccc" /> : (
                    error ? <p style={{color: 'red'}}>{error}</p> : (
                        result && (
                            counter.type === 'local' ? ( // LOCAL DISPLAY
                                <>
                                    <ResultValue>
                                        {formatMoney(
                                            counter.sub_type === 'cross'
                                                ? (result.netPosition ?? result.disponivel ?? 0)
                                                : (result.disponivel ?? result.netPosition ?? 0)
                                        )}
                                    </ResultValue>
                                    <ResultLabel>
                                        {counter.sub_type === 'cross' ? 'Daily Net Position' : 'Available Balance'}
                                    </ResultLabel>
                                    <CalculationPeriod>
                                        {counter.sub_type === 'cross' 
                                            ? (result.calculationPeriod?.start && result.calculationPeriod?.end
                                                ? `Net for period: ${formatDisplayDateTime(result.calculationPeriod.start)} - ${formatDisplayDateTime(result.calculationPeriod.end)}`
                                                : `Net for date: ${result.dataReferencia || 'Today'}`)
                                            : `Balance for date: ${result.dataReferencia || 'Today'}`
                                        }
                                    </CalculationPeriod>
                                </>
                            ) : ( // REMOTE DISPLAY
                                <>
                                    <ResultValue>
                                        {formatMoney(result.disponivel ?? result.netPosition ?? 0)}
                                    </ResultValue>
                                    <ResultLabel>Available Balance</ResultLabel>
                                    <CalculationPeriod>
                                        Balance for date: {result.dataReferencia || 'Today'}
                                    </CalculationPeriod>
                                </>
                            )
                        )
                    )
                )}
            </ResultContainer>
            {lastUpdated && <LastUpdated>Last updated: {format(lastUpdated, 'HH:mm:ss')}</LastUpdated>}
        </Card>
    );
};

export default PositionCounterCard;
