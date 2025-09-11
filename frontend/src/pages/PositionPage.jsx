import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import api from '../services/api';
import { format } from 'date-fns';
import { FaCalculator } from 'react-icons/fa';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rem;
    padding-top: 2rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.08);
    width: 100%;
    max-width: 600px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const InputContainer = styled.div`
    display: flex;
    gap: 1rem;
    align-items: flex-end;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex-grow: 1;
`;

const Label = styled.label`
    font-weight: 600;
    color: ${({ theme }) => theme.primary};
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 4px;
    font-weight: 600;
    cursor: pointer;
    background-color: ${({ theme, primary }) => theme.secondary};
    color: white;
    font-size: 1rem;
    
    &:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
`;

const ResultCard = styled(Card)`
    text-align: center;
    border-top: 4px solid ${({ theme }) => theme.secondary};
`;

const ResultValue = styled.p`
    font-size: 2.5rem;
    font-weight: 700;
    color: ${({ theme }) => theme.primary};
    margin: 0;
`;

const ResultLabel = styled.p`
    font-size: 1rem;
    color: ${({ theme }) => theme.lightText};
    margin: 0;
`;

const CalculationPeriod = styled.p`
    font-size: 0.85rem;
    color: #888;
    margin-top: 1rem;
    background-color: ${({ theme }) => theme.background};
    padding: 0.5rem;
    border-radius: 4px;
`;

const PositionPage = () => {
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [result, setResult] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleCalculate = async () => {
        setLoading(true);
        setError('');
        setResult(null);
        try {
            const { data } = await api.get('/position', { params: { date: selectedDate } });
            setResult(data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to calculate position.');
        } finally {
            setLoading(false);
        }
    };
    
    // Automatically calculate on first page load for today's date
    useEffect(() => {
        handleCalculate();
    }, []);

    const formatDisplayDateTime = (isoString) => {
        return format(new Date(isoString), 'MMM dd, yyyy, HH:mm:ss');
    };

    return (
        <PageContainer>
            <Card>
                <h2>Calculate Net Position</h2>
                <InputContainer>
                    <InputGroup>
                        <Label>Select Business Day</Label>
                        <Input 
                            type="date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </InputGroup>
                    <Button onClick={handleCalculate} disabled={loading}>
                        <FaCalculator /> {loading ? 'Calculating...' : 'Calculate'}
                    </Button>
                </InputContainer>
            </Card>

            {result && (
                <ResultCard>
                    <ResultLabel>Net Position</ResultLabel>
                    <ResultValue>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(result.netPosition).replace('$', '')}
                    </ResultValue>
                    <ResultLabel>from {result.transactionCount} transactions</ResultLabel>

                    <CalculationPeriod>
                        <strong>Period:</strong> {formatDisplayDateTime(result.calculationPeriod.start)} <br/>
                        <strong>To:</strong> {formatDisplayDateTime(result.calculationPeriod.end)}
                    </CalculationPeriod>
                </ResultCard>
            )}
             {error && <p style={{color: 'red'}}>{error}</p>}
        </PageContainer>
    );
};

export default PositionPage;