import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions, getPortalDashboardSummary } from '../services/api'; // <--- FIX: Changed Import
import { FaSyncAlt } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import { format } from 'date-fns';

const PageContainer = styled(motion.div)``;

const ControlsContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
`;

const RefreshButton = styled.button`
    padding: 0.75rem 1.5rem;
    border: none;
    background: ${({ theme }) => theme.secondary};
    color: white;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    transition: all 0.2s;
    
    &:hover {
        transform: translateY(-2px);
    }
`;

const VolumeCard = styled.div`
    background: #fff;
    padding: 1rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    text-align: center;

    h3 {
        margin: 0;
        font-size: 0.9rem;
        color: ${({ theme }) => theme.lightText};
        font-weight: 500;
    }
    p {
        margin: 0;
        font-size: 2rem;
        font-weight: 700;
        color: ${({ theme }) => theme.primary};
        font-family: 'Courier New', Courier, monospace;
    }
`;

const Card = styled.div`
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    overflow: hidden;
`;

const TableWrapper = styled.div`
    overflow-x: auto;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    font-size: 0.95rem;
    th, td {
        padding: 1rem 1.5rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: #F6F9FC;
        font-weight: 600;
        color: ${({ theme }) => theme.lightText};
    }
    tr:last-child td {
        border-bottom: none;
    }
    tr:hover {
        background-color: #F6F9FC;
    }
`;

const EmptyStateContainer = styled.div`
    text-align: center;
    padding: 4rem;
    color: ${({ theme }) => theme.lightText};
`;

const shimmer = keyframes`
  0% { background-position: -1000px 0; }
  100% { background-position: 1000px 0; }
`;
const SkeletonCell = styled.div`
    height: 20px;
    width: 80%;
    border-radius: 4px;
    background: #f6f7f8;
    background-image: linear-gradient(to right, #f6f7f8 0%, #edeef1 20%, #f6f7f8 40%, #f6f7f8 100%);
    background-repeat: no-repeat;
    background-size: 2000px 100%;
    animation: ${shimmer} 2s linear infinite;
`;
const SkeletonRow = () => (
    <tr>
        <td><SkeletonCell /></td>
        <td><SkeletonCell /></td>
        <td><SkeletonCell style={{width: '60%'}}/></td>
    </tr>
);

const ClientViewOnlyDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [todayVolume, setTodayVolume] = useState(0);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    
    const todayDate = format(new Date(), 'yyyy-MM-dd');

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = { 
            date: todayDate 
        };
        
        try {
            const [transRes, summaryRes] = await Promise.all([
                getPortalTransactions({ ...params, page: pagination.page, limit: pagination.limit }),
                getPortalDashboardSummary(params) // <--- FIX: Use the correct API function
            ]);

            setTransactions(transRes.data.transactions || []);
            setPagination(prev => ({ ...prev, totalPages: transRes.data.totalPages, totalRecords: transRes.data.totalRecords, currentPage: transRes.data.currentPage }));
            
            // <--- FIX: Extract 'dailyTotalIn' from the summary response
            setTodayVolume(summaryRes.data.dailyTotalIn || 0);

        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, todayDate]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatDateTime = (dbDateString) => {
        if (!dbDateString) return 'N/A';
        const date = new Date(dbDateString);
        return new Intl.DateTimeFormat('en-GB', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    };

    return (
        <PageContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ControlsContainer>
                <h2 style={{color: '#0A2540'}}>Transactions for Today ({format(new Date(), 'dd/MM/yyyy')})</h2>
                <div style={{display: 'flex', gap: '1.5rem', alignItems: 'center'}}>
                    <VolumeCard>
                        <h3>Volume Today (BRL)</h3>
                        <p>{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(todayVolume)}</p>
                    </VolumeCard>
                    <RefreshButton onClick={fetchData}><FaSyncAlt /> Refresh</RefreshButton>
                </div>
            </ControlsContainer>

            <Card>
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Sender</th>
                                <th>Amount (BRL)</th>
                            </tr>
                        </thead>
                        {loading ? (
                            <tbody>{[...Array(10)].map((_, i) => <SkeletonRow key={i} />)}</tbody>
                        ) : transactions.length === 0 ? (
                            <tbody><tr><td colSpan="3"><EmptyStateContainer><h3>No transactions found for today</h3></EmptyStateContainer></td></tr></tbody>
                        ) : (
                            <tbody>
                                {transactions.map(tx => (
                                    <motion.tr key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                        <td>{formatDateTime(tx.transaction_date)}</td>
                                        <td>{tx.sender_name}</td>
                                        <td style={{ color: '#00C49A', fontWeight: '600' }}>
                                            {parseFloat(tx.amount).toFixed(2)}
                                        </td>
                                    </motion.tr>
                                ))}
                            </tbody>
                        )}
                    </Table>
                </TableWrapper>
                <Pagination pagination={pagination} setPagination={setPagination} />
            </Card>
        </PageContainer>
    );
};

export default ClientViewOnlyDashboard;