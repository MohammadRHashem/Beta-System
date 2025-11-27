import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions } from '../services/api'; // No dashboard summary needed here
import { FaSyncAlt, FaArrowUp, FaArrowDown } from 'react-icons/fa'; // Added missing icons
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

const Card = styled.div`
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.06);
    overflow: hidden;
`;

const TableWrapper = styled.div`
    overflow-x: auto;
    @media (max-width: 768px) { display: none; }
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

// Added Type and Amount Cells matching ClientDashboard
const AmountCell = styled.td` font-weight: 600; font-family: 'Courier New', Courier, monospace; color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error}; `;
const TypeCell = styled.td` font-weight: 700; text-transform: uppercase; color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error}; `;

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
        <td><SkeletonCell /></td>
        <td><SkeletonCell style={{width: '60%'}}/></td>
    </tr>
);

// Added Mobile Styles matching ClientDashboard
const MobileListContainer = styled.div`
    display: none;
    flex-direction: column;
    @media (max-width: 768px) {
        display: flex;
        padding: 0 1rem;
    }
`;

const MobileCard = styled(motion.div)`
    background: transparent;
    box-shadow: none;
    border-radius: 0;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    padding: 1rem 0.5rem;

    &:last-child {
        border-bottom: none;
    }
`;

const MobileCardHeader = styled.div` display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; font-size: 1.2rem; font-weight: 700; font-family: 'Courier New', Courier, monospace; color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error}; `;
const MobileCardBody = styled.div` font-size: 0.9rem; color: ${({ theme }) => theme.lightText}; p { margin: 0.25rem 0; } strong { color: ${({ theme }) => theme.text}; } `;


const ClientViewOnlyDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    
    const todayDate = format(new Date(), 'yyyy-MM-dd');

    const fetchData = useCallback(async () => {
        setLoading(true);
        const params = { 
            date: todayDate,
            page: pagination.page, 
            limit: pagination.limit
        };
        
        try {
            const { data } = await getPortalTransactions(params);

            setTransactions(data.transactions || []);
            setPagination(prev => ({ 
                ...prev, 
                totalPages: data.totalPages, 
                totalRecords: data.totalRecords, 
                currentPage: data.currentPage 
            }));

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

    const formatCurrency = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

    const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
    const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

    return (
        <PageContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ControlsContainer>
                <h2 style={{color: '#0A2540'}}>Transactions for Today ({format(new Date(), 'dd/MM/yyyy')})</h2>
                <RefreshButton onClick={fetchData}><FaSyncAlt /> Refresh</RefreshButton>
            </ControlsContainer>

            <Card>
                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Type</th>
                                <th>Counterparty</th>
                                <th>Amount (BRL)</th>
                            </tr>
                        </thead>
                        <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
                            {loading ? ([...Array(10)].map((_, i) => <SkeletonRow key={i} />)) : 
                             transactions.length === 0 ? (<tr><td colSpan="4"><EmptyStateContainer><h3>No transactions found for today</h3></EmptyStateContainer></td></tr>) : 
                             (transactions.map(tx => (
                                <motion.tr key={tx.id} variants={itemVariants}>
                                    <td>{formatDateTime(tx.transaction_date)}</td>
                                    <TypeCell isCredit={tx.operation_direct === 'in'}>
                                        {tx.operation_direct}
                                    </TypeCell>
                                    <td>{tx.sender_name || tx.counterparty_name || 'Unknown'}</td>
                                    <AmountCell isCredit={tx.operation_direct === 'in'}>
                                        {tx.operation_direct === 'in' ? '+' : '-'}
                                        {formatCurrency(tx.amount)}
                                    </AmountCell>
                                </motion.tr>
                            )))}
                        </motion.tbody>
                    </Table>
                </TableWrapper>
                <MobileListContainer>
                    {loading ? <p>Loading...</p> : transactions.map(tx => (
                        <MobileCard key={tx.id} isCredit={tx.operation_direct === 'in'} variants={itemVariants}>
                            <MobileCardHeader isCredit={tx.operation_direct === 'in'}>
                                {tx.operation_direct === 'in' ? '+' : '-'} {formatCurrency(tx.amount)}
                                <span>{tx.operation_direct === 'in' ? <FaArrowUp/> : <FaArrowDown/>}</span>
                            </MobileCardHeader>
                            <MobileCardBody>
                                <p><strong>{tx.sender_name || tx.counterparty_name || 'Unknown'}</strong></p>
                                <p>{formatDateTime(tx.transaction_date)}</p>
                            </MobileCardBody>
                        </MobileCard>
                    ))}
                </MobileListContainer>
                <Pagination pagination={pagination} setPagination={setPagination} />
            </Card>
        </PageContainer>
    );
};

export default ClientViewOnlyDashboard;