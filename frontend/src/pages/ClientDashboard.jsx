import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions, getPortalFilteredVolume } from '../services/api';
import { FaSyncAlt, FaSearch } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import { usePortal } from '../context/PortalContext';

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

// ... All styled-components (PageContainer, ControlsContainer, etc.) remain unchanged ...
const PageContainer = styled(motion.div)``;

const ControlsContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;

    @media (max-width: 960px) {
        flex-direction: column; 
        align-items: stretch;
    }
`;

const FilterContainer = styled.div`
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    align-items: center;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 1rem;
    min-width: 240px;
    transition: all 0.2s;

    &:focus {
        outline: none;
        border-color: ${({ theme }) => theme.secondary};
        box-shadow: 0 0 0 3px rgba(0, 196, 154, 0.2);
    }
`;

const InputGroup = styled.div`
    position: relative;
    display: flex;
    align-items: center;

    svg {
        position: absolute;
        left: 12px;
        color: ${({ theme }) => theme.lightText};
    }
    
    ${Input} {
        padding-left: 35px;
    }
`;

const DateInput = styled(Input).attrs({type: 'date'})`
    padding-left: 0.75rem;
`;

const RefreshButton = styled.button`
    padding: 0.75rem 1rem;
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

const VolumeContainer = styled.div`
    display: flex;
    gap: 1rem;
    
    @media (max-width: 960px) {
        order: -1;
        width: 100%;
    }
`;

const VolumeCard = styled.div`
    background: #fff;
    padding: 1rem 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.05);
    text-align: right;
    flex-grow: 1;

    h3 {
        margin: 0;
        font-size: 0.9rem;
        color: ${({ theme }) => theme.lightText};
        font-weight: 500;
    }
    p {
        margin: 0;
        font-size: 1.75rem;
        font-weight: 700;
        color: ${({ theme }) => theme.primary};
        font-family: 'Courier New', Courier, monospace;
    }

    @media (max-width: 768px) {
        text-align: center;
        padding: 1.25rem;
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


const ClientDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [volumeOfDay, setVolumeOfDay] = useState(0);
    const { filters, setFilters } = usePortal();
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    
    const debouncedSearch = useDebounce(filters.search, 500);

    const fetchData = useCallback(async (pageToFetch, dateToFetch, searchToFetch) => {
        setLoading(true);
        const params = { 
            search: searchToFetch, 
            date: dateToFetch,
            page: pageToFetch, 
            limit: pagination.limit
        };
        try {
            const [transRes, volRes] = await Promise.all([
                getPortalTransactions(params),
                getPortalFilteredVolume({ search: searchToFetch, date: dateToFetch })
            ]);
            setTransactions(transRes.data.transactions || []);
            setPagination(prev => ({ 
                ...prev, 
                totalPages: transRes.data.totalPages, 
                totalRecords: transRes.data.totalRecords, 
                currentPage: transRes.data.currentPage 
            }));
            setVolumeOfDay(volRes.data.totalVolume || 0);
        } catch (error) {
            console.error("Failed to fetch data:", error);
        } finally {
            setLoading(false);
        }
    }, [pagination.limit]); // The function itself only depends on limit.

    // Effect 1: Set initial date ONCE.
    useEffect(() => {
        const today = new Date().toISOString().split('T')[0];
        setFilters(prev => ({ ...prev, date: today }));
    }, [setFilters]); // This is safe and follows the rules.

    // Effect 2: Reset to page 1 ONLY when filters change.
    useEffect(() => {
        setPagination(p => ({ ...p, page: 1 }));
    }, [debouncedSearch, filters.date]);

    // Effect 3: The MAIN and ONLY data fetching effect.
    // It runs when the page, or the filters that reset the page, change.
    useEffect(() => {
        // Don't fetch until the initial date has been set.
        if (filters.date) {
            fetchData(pagination.page, filters.date, debouncedSearch);
        }
    }, [pagination.page, filters.date, debouncedSearch, fetchData]);


    const handleFilterChange = (e) => {
        setFilters(prevFilters => ({ ...prevFilters, [e.target.name]: e.target.value }));
    };
    
    const formatDateTime = (dbDateString) => {
        if (!dbDateString) return 'N/A';
        const date = new Date(dbDateString);
        return new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(date);
    };

    const containerVariants = { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.05 } } };
    const itemVariants = { hidden: { y: 20, opacity: 0 }, visible: { y: 0, opacity: 1 } };

    return (
        <PageContainer initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <ControlsContainer>
                <FilterContainer>
                    <InputGroup>
                        <FaSearch />
                        <Input as="input" name="search" type="text" value={filters.search} onChange={handleFilterChange} placeholder="Search..." />
                    </InputGroup>
                    <DateInput name="date" value={filters.date || ''} onChange={handleFilterChange} />
                    <RefreshButton onClick={() => fetchData(pagination.page, filters.date, debouncedSearch)}><FaSyncAlt /> Refresh</RefreshButton>
                </FilterContainer>
                
                <VolumeContainer>
                    <VolumeCard>
                        <h3>Volume of Day (BRL)</h3>
                        <p>{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(volumeOfDay)}</p>
                    </VolumeCard>
                </VolumeContainer>
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
                        <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
                            {loading ? ([...Array(10)].map((_, i) => <SkeletonRow key={i} />)) : 
                             transactions.length === 0 ? (<tr><td colSpan="3"><EmptyStateContainer><h3>No transactions found</h3></EmptyStateContainer></td></tr>) : 
                             (transactions.map(tx => (
                                <motion.tr key={tx.id} variants={itemVariants}>
                                    <td>{formatDateTime(tx.transaction_date)}</td>
                                    <td>{tx.sender_name}</td>
                                    <td style={{ color: '#00C49A', fontWeight: '600' }}>
                                        {parseFloat(tx.amount).toFixed(2)}
                                    </td>
                                </motion.tr>
                            )))}
                        </motion.tbody>
                    </Table>
                </TableWrapper>
                <Pagination pagination={pagination} setPagination={setPagination} />
            </Card>
        </PageContainer>
    );
};

export default ClientDashboard;