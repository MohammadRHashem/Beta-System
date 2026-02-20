import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions, updatePortalTransactionConfirmation } from '../services/api';
import { FaSyncAlt, FaArrowUp, FaArrowDown, FaHourglassHalf, FaSpinner, FaCheckDouble } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import PasscodeModal from '../components/PasscodeModal';
import { format } from 'date-fns';

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const LoadingSpinner = styled(FaSpinner)`
    animation: ${spin} 1s linear infinite;
`;

const ConfirmationButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.5rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.4rem;
    border-radius: 50%;
    transition: all 0.2s;
    color: ${({ theme, confirmed }) => confirmed ? theme.success : theme.lightText};
    &:hover:not(:disabled) {
        background-color: ${({ confirmed }) => confirmed ? '#e6fff9' : '#e3f2fd'};
    }
    &:disabled {
        cursor: not-allowed;
        opacity: 0.5;
    }
`;

const StatusText = styled.span`
    font-weight: 600;
    font-size: 0.9rem;
    width: 82px;
    color: ${({ confirmed, theme }) => confirmed ? theme.success : theme.lightText};
`;

const PageContainer = styled(motion.div)``;

const ControlsContainer = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
`;

const FilterGroup = styled.div`
    display: flex;
    align-items: center;
    gap: 0.8rem;
    flex-wrap: wrap;
`;

const DateInput = styled.input`
    padding: 0.65rem 0.8rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    background: #fff;
`;

const SelectInput = styled.select`
    padding: 0.65rem 0.8rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 8px;
    font-size: 0.95rem;
    background: #fff;
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

const AmountCell = styled.td`
    font-weight: 600;
    font-family: 'Courier New', Courier, monospace;
    color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error};
`;

const TypeCell = styled.td`
    font-weight: 700;
    text-transform: uppercase;
    color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error};
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
        <td><SkeletonCell /></td>
        <td><SkeletonCell style={{ width: '60%' }} /></td>
        <td><SkeletonCell style={{ width: '50%' }} /></td>
    </tr>
);

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

const MobileCardHeader = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    font-size: 1.2rem;
    font-weight: 700;
    font-family: 'Courier New', Courier, monospace;
    color: ${({ isCredit, theme }) => isCredit ? theme.success : theme.error};
`;

const MobileCardBody = styled.div`
    font-size: 0.9rem;
    color: ${({ theme }) => theme.lightText};
    p { margin: 0.25rem 0; }
    strong { color: ${({ theme }) => theme.text}; }
`;

const MobileRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 0.75rem;
    .label {
        font-weight: 600;
        color: ${({ theme }) => theme.primary};
    }
`;

const isCreditTx = (tx) => tx.operation_direct === 'in' || tx.operation_direct === 'C';

const ClientViewOnlyDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    const [filters, setFilters] = useState({
        date: format(new Date(), 'yyyy-MM-dd'),
        confirmation: ''
    });
    const [updatingIds, setUpdatingIds] = useState(new Set());
    const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
    const [transactionToUpdate, setTransactionToUpdate] = useState(null);
    const [passcodeError, setPasscodeError] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                date: filters.date,
                page: pagination.page,
                limit: pagination.limit
            };
            if (filters.confirmation) {
                params.confirmation = filters.confirmation;
            }

            const { data } = await getPortalTransactions(params);

            setTransactions(data.transactions || []);
            setPagination((prev) => ({
                ...prev,
                totalPages: data.totalPages,
                totalRecords: data.totalRecords,
                currentPage: data.currentPage
            }));
        } catch (error) {
            console.error('Failed to fetch data:', error);
        } finally {
            setLoading(false);
        }
    }, [filters.date, filters.confirmation, pagination.page, pagination.limit]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        setPagination((prev) => ({ ...prev, page: 1 }));
    }, [filters.date, filters.confirmation]);

    const handleConfirm = async (tx) => {
        if (updatingIds.has(tx.id)) return;
        if (!window.confirm('Confirm this transaction belongs to one of your customers?')) return;

        setUpdatingIds((prev) => new Set(prev).add(tx.id));
        try {
            await updatePortalTransactionConfirmation(tx.id, tx.source, true);
            setTransactions((prev) => prev.map((item) => item.id === tx.id ? { ...item, is_portal_confirmed: 1 } : item));
        } catch (error) {
            alert(error.response?.data?.message || 'Something went wrong. Please try again.');
        } finally {
            setUpdatingIds((prev) => {
                const next = new Set(prev);
                next.delete(tx.id);
                return next;
            });
        }
    };

    const handleInitiateUnconfirm = (tx) => {
        if (updatingIds.has(tx.id)) return;
        setTransactionToUpdate(tx);
        setPasscodeError('');
        setIsPasscodeModalOpen(true);
    };

    const closePasscodeModal = () => {
        setIsPasscodeModalOpen(false);
        setTransactionToUpdate(null);
        setPasscodeError('');
    };

    const handlePasscodeSubmit = async (passcode) => {
        if (!transactionToUpdate) return;
        const targetTxId = transactionToUpdate.id;

        setUpdatingIds((prev) => new Set(prev).add(targetTxId));
        try {
            await updatePortalTransactionConfirmation(transactionToUpdate.id, transactionToUpdate.source, false, passcode);
            setTransactions((prev) => prev.map((item) => item.id === transactionToUpdate.id ? { ...item, is_portal_confirmed: 0 } : item));
            closePasscodeModal();
        } catch (error) {
            if (error.response?.status === 403) {
                setPasscodeError('Incorrect PIN');
            } else {
                alert(error.response?.data?.message || 'Something went wrong. Please try again.');
                closePasscodeModal();
            }
        } finally {
            setUpdatingIds((prev) => {
                const next = new Set(prev);
                next.delete(targetTxId);
                return next;
            });
        }
    };

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
                <h2 style={{ color: '#0A2540', margin: 0 }}>
                    Transactions ({format(new Date(filters.date), 'dd/MM/yyyy')})
                </h2>
                <FilterGroup>
                    <DateInput
                        type="date"
                        value={filters.date}
                        onChange={(e) => setFilters((prev) => ({ ...prev, date: e.target.value }))}
                    />
                    <SelectInput
                        value={filters.confirmation}
                        onChange={(e) => setFilters((prev) => ({ ...prev, confirmation: e.target.value }))}
                    >
                        <option value="">All Statuses</option>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                    </SelectInput>
                    <RefreshButton onClick={fetchData}>
                        <FaSyncAlt /> Refresh
                    </RefreshButton>
                </FilterGroup>
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
                                <th>Confirmation</th>
                            </tr>
                        </thead>
                        <motion.tbody variants={containerVariants} initial="hidden" animate="visible">
                            {loading ? (
                                [...Array(10)].map((_, index) => <SkeletonRow key={index} />)
                            ) : transactions.length === 0 ? (
                                <tr>
                                    <td colSpan="5">
                                        <EmptyStateContainer>
                                            <h3>No transactions found</h3>
                                        </EmptyStateContainer>
                                    </td>
                                </tr>
                            ) : (
                                transactions.map((tx) => {
                                    const isCredit = isCreditTx(tx);
                                    const isConfirmedByPortal = !!tx.is_portal_confirmed;
                                    const isUpdatingConfirmation = updatingIds.has(tx.id);
                                    return (
                                        <motion.tr key={tx.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                                            <td>{formatDateTime(tx.transaction_date)}</td>
                                            <TypeCell isCredit={isCredit}>{isCredit ? 'IN' : 'OUT'}</TypeCell>
                                            <td>{isCredit ? (tx.sender_name || 'Unknown') : (tx.counterparty_name || 'Unknown Receiver')}</td>
                                            <AmountCell isCredit={isCredit}>
                                                {isCredit ? '+' : '-'}{formatCurrency(tx.amount)}
                                            </AmountCell>
                                            <td style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                {isUpdatingConfirmation ? (
                                                    <LoadingSpinner />
                                                ) : isConfirmedByPortal ? (
                                                    <ConfirmationButton confirmed={true} onClick={() => handleInitiateUnconfirm(tx)} title="Un-confirm">
                                                        <FaCheckDouble />
                                                    </ConfirmationButton>
                                                ) : (
                                                    <ConfirmationButton confirmed={false} onClick={() => handleConfirm(tx)} title="Confirm">
                                                        <FaHourglassHalf />
                                                    </ConfirmationButton>
                                                )}
                                                <StatusText confirmed={isConfirmedByPortal}>
                                                    {isConfirmedByPortal ? 'Confirmed' : 'Pending'}
                                                </StatusText>
                                            </td>
                                        </motion.tr>
                                    );
                                })
                            )}
                        </motion.tbody>
                    </Table>
                </TableWrapper>

                <MobileListContainer>
                    {loading ? (
                        <p>Loading...</p>
                    ) : transactions.length === 0 ? (
                        <EmptyStateContainer><h3>No transactions found</h3></EmptyStateContainer>
                    ) : (
                        transactions.map((tx) => {
                            const isCredit = isCreditTx(tx);
                            const isConfirmedByPortal = !!tx.is_portal_confirmed;
                            const isUpdatingConfirmation = updatingIds.has(tx.id);
                            return (
                                <MobileCard key={tx.id} isCredit={isCredit} variants={itemVariants}>
                                    <MobileCardHeader isCredit={isCredit}>
                                        {isCredit ? '+' : '-'} {formatCurrency(tx.amount)}
                                        <span>{isCredit ? <FaArrowUp /> : <FaArrowDown />}</span>
                                    </MobileCardHeader>
                                    <MobileCardBody>
                                        <p><strong>{isCredit ? (tx.sender_name || 'Unknown') : (tx.counterparty_name || 'Unknown Receiver')}</strong></p>
                                        <p>{formatDateTime(tx.transaction_date)}</p>
                                    </MobileCardBody>

                                    <MobileRow>
                                        <span className="label">Confirmation</span>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            {isUpdatingConfirmation ? (
                                                <LoadingSpinner />
                                            ) : isConfirmedByPortal ? (
                                                <ConfirmationButton confirmed={true} onClick={() => handleInitiateUnconfirm(tx)}>
                                                    <FaCheckDouble />
                                                </ConfirmationButton>
                                            ) : (
                                                <ConfirmationButton confirmed={false} onClick={() => handleConfirm(tx)}>
                                                    <FaHourglassHalf />
                                                </ConfirmationButton>
                                            )}
                                            <StatusText confirmed={isConfirmedByPortal}>
                                                {isConfirmedByPortal ? 'Confirmed' : 'Pending'}
                                            </StatusText>
                                        </div>
                                    </MobileRow>
                                </MobileCard>
                            );
                        })
                    )}
                </MobileListContainer>

                <Pagination pagination={pagination} setPagination={setPagination} />
            </Card>

            <PasscodeModal
                isOpen={isPasscodeModalOpen}
                onClose={closePasscodeModal}
                onSubmit={handlePasscodeSubmit}
                error={passcodeError}
                clearError={() => setPasscodeError('')}
            />
        </PageContainer>
    );
};

export default ClientViewOnlyDashboard;
