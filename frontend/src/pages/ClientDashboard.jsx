import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions, getPortalDashboardSummary } from '../services/api';
import { FaSyncAlt, FaSearch, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import { usePortal } from '../context/PortalContext';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { format, parseISO } from 'date-fns';

// ... (All styled components and useDebounce hook remain exactly the same) ...
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};
const PageContainer = styled(motion.div)``;
const ControlsContainer = styled.div` display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 1.5rem; `;
const TopControls = styled.div` display: flex; flex-wrap: wrap; gap: 1rem; justify-content: space-between; align-items: flex-start; `;
const FilterContainer = styled.div` display: flex; flex-wrap: wrap; gap: 1rem; align-items: center; `;
const Input = styled.input` padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 8px; font-size: 1rem; min-width: 240px; transition: all 0.2s; &:focus { outline: none; border-color: ${({ theme }) => theme.secondary}; box-shadow: 0 0 0 3px rgba(0, 196, 154, 0.2); } `;
const InputGroup = styled.div` position: relative; display: flex; align-items: center; svg { position: absolute; left: 12px; color: ${({ theme }) => theme.lightText}; } ${Input} { padding-left: 35px; } `;
// Removed unused DateInput styled component
const RefreshButton = styled.button` padding: 0.75rem 1rem; border: none; background: ${({ theme }) => theme.secondary}; color: white; font-weight: 600; border-radius: 8px; cursor: pointer; display: flex; align-items: center; gap: 0.5rem; transition: all 0.2s; &:hover { transform: translateY(-2px); } `;
const Card = styled.div` background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); overflow: hidden; `;
const TableWrapper = styled.div` overflow-x: auto; @media (max-width: 768px) { display: none; } `;
const Table = styled.table` width: 100%; border-collapse: collapse; font-size: 0.95rem; th, td { padding: 1rem 1.5rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; } th { background-color: #F6F9FC; font-weight: 600; color: ${({ theme }) => theme.lightText}; } tr:last-child td { border-bottom: none; } `;
const AmountCell = styled.td` font-weight: 600; font-family: 'Courier New', Courier, monospace; color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error}; `;
const TypeCell = styled.td` font-weight: 700; text-transform: uppercase; color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error}; `;
const EmptyStateContainer = styled.div` text-align: center; padding: 4rem; color: ${({ theme }) => theme.lightText}; `;
const SkeletonCell = styled.div` height: 20px; width: 80%; border-radius: 4px; background: #f6f7f8; `;
const VolumeContainer = styled.div` display: grid; gap: 1rem; grid-template-columns: repeat(3, 1fr); @media (max-width: 768px) { grid-template-columns: repeat(2, 1fr); } `;
const VolumeCard = styled.div` background: #fff; padding: 1rem 1.5rem; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border-left: 4px solid ${({ theme, color }) => theme[color] || theme.primary}; h3 { margin: 0; font-size: 0.9rem; color: ${({ theme }) => theme.lightText}; font-weight: 500; } p { margin: 0; font-size: 1.75rem; font-weight: 700; color: ${({ theme, color }) => theme[color] || theme.primary}; font-family: 'Courier New', Courier, monospace; } @media (max-width: 768px) { ${({ fullWidthOnMobile }) => fullWidthOnMobile && ` grid-column: 1 / -1; `} padding: 0.75rem 1rem; h3 { font-size: 0.8rem; } p { font-size: 1.5rem; } } `;

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


const ClientDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ 
        dailyTotalIn: 0, dailyTotalOut: 0, allTimeBalance: 0,
        dailyCountIn: 0, dailyCountOut: 0
    });
    const [loadingTable, setLoadingTable] = useState(true);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const { filters, setFilters } = usePortal();
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    
    const debouncedSearch = useDebounce(filters.search, 500);

    const fetchTableData = useCallback(async () => {
        setLoadingTable(true);
        try {
            const params = { search: debouncedSearch, date: filters.date, page: pagination.page, limit: pagination.limit };
            const { data } = await getPortalTransactions(params);
            setTransactions(data.transactions || []);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords, currentPage: data.currentPage }));
        } catch (error) {
            console.error("Failed to fetch transactions:", error);
        } finally {
            setLoadingTable(false);
        }
    }, [pagination.page, pagination.limit, filters.date, debouncedSearch]);

    const fetchSummaryData = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const { data } = await getPortalDashboardSummary({ date: filters.date });
            setSummary(data);
        } catch (error) {
            console.error("Failed to fetch summary:", error);
        } finally {
            setLoadingSummary(false);
        }
    }, [filters.date]);

    useEffect(() => {
        if (!filters.date) {
            const today = new Date().toISOString().split('T')[0];
            setFilters(prev => ({ ...prev, date: today }));
        }
    }, [filters.date, setFilters]);

    useEffect(() => {
        setPagination(p => ({ ...p, page: 1 }));
    }, [debouncedSearch, filters.date]);

    useEffect(() => {
        if (filters.date) {
            fetchTableData();
        }
    }, [fetchTableData]);

    useEffect(() => {
        if (filters.date) {
            fetchSummaryData();
        }
    }, [fetchSummaryData]);

    const handleFilterChange = (e) => {
        setFilters(prevFilters => ({ ...prevFilters, [e.target.name]: e.target.value }));
    };

    const handleDateChange = (date) => {
        setFilters(prevFilters => ({ 
            ...prevFilters, 
            date: date ? format(date, 'yyyy-MM-dd') : '' 
        }));
    };
    
    const formatDateTime = (dbDateString) => {
        if (!dbDateString) return 'N/A';
        const date = new Date(dbDateString);
        return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    const formatCurrency = (value) => new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    const formatNumber = (value) => new Intl.NumberFormat().format(value);

    const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
    const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

    return (
        <PageContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ControlsContainer>
                <TopControls>
                    <FilterContainer>
                        <InputGroup>
                            <FaSearch />
                            <Input as="input" name="search" type="text" value={filters.search} onChange={handleFilterChange} placeholder="Search by name..." />
                        </InputGroup>
                        <div style={{minWidth: '240px'}}>
                            <DatePicker 
                                selected={filters.date ? parseISO(filters.date) : null}
                                onChange={handleDateChange}
                                dateFormat="dd/MM/yyyy"
                                placeholderText="dd/mm/yyyy"
                                className="custom-datepicker" 
                                // Note: Ensure global styles handle .custom-datepicker or rely on previous global styles
                            />
                        </div>
                        <RefreshButton onClick={() => { fetchTableData(); fetchSummaryData(); }}><FaSyncAlt /> Refresh</RefreshButton>
                    </FilterContainer>
                </TopControls>
                
                <VolumeContainer>
                    <VolumeCard color="success">
                        <h3>IN TRANSACTIONS (BRL)</h3>
                        <p>{loadingSummary ? '...' : formatCurrency(summary.dailyTotalIn)}</p>
                    </VolumeCard>
                    <VolumeCard color="error">
                        <h3>OUT TRANSACTIONS (BRL)</h3>
                        <p>{loadingSummary ? '...' : formatCurrency(summary.dailyTotalOut)}</p>
                    </VolumeCard>
                    <VolumeCard color="primary" fullWidthOnMobile>
                        <h3>All-Time Balance (BRL)</h3>
                        <p>{loadingSummary ? '...' : formatCurrency(summary.allTimeBalance)}</p>
                    </VolumeCard>
                    <VolumeCard color="success">
                        <h3>Number of Transactions (IN)</h3>
                        <p>{loadingSummary ? '...' : formatNumber(summary.dailyCountIn)}</p>
                    </VolumeCard>
                    <VolumeCard color="error">
                        <h3>Number of Transactions (OUT)</h3>
                        <p>{loadingSummary ? '...' : formatNumber(summary.dailyCountOut)}</p>
                    </VolumeCard>
                </VolumeContainer>

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
                            {loadingTable ? ([...Array(10)].map((_, i) => <tr key={i}><td colSpan="4"><SkeletonCell /></td></tr>)) : 
                             transactions.length === 0 ? (<tr><td colSpan="4"><EmptyStateContainer><h3>No transactions found</h3></EmptyStateContainer></td></tr>) : 
                             (transactions.map(tx => (
                                <motion.tr key={tx.id} variants={itemVariants}>
                                    <td>{formatDateTime(tx.transaction_date)}</td>
                                    <TypeCell isCredit={tx.operation_direct === 'in'}>
                                        {tx.operation_direct}
                                    </TypeCell>
                                    {/* === FIX: Use sender_name instead of counterparty_name === */}
                                    <td>{tx.sender_name}</td>
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
                    {loadingTable ? <p>Loading...</p> : transactions.map(tx => (
                        <MobileCard key={tx.id} isCredit={tx.operation_direct === 'in'} variants={itemVariants}>
                            <MobileCardHeader isCredit={tx.operation_direct === 'in'}>
                                {tx.operation_direct === 'in' ? '+' : '-'} {formatCurrency(tx.amount)}
                                <span>{tx.operation_direct === 'in' ? <FaArrowUp/> : <FaArrowDown/>}</span>
                            </MobileCardHeader>
                            <MobileCardBody>
                                {/* === FIX: Use sender_name here as well === */}
                                <p><strong>{tx.sender_name}</strong></p>
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

export default ClientDashboard;