import React, { useState, useEffect, useCallback } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion } from 'framer-motion';
import { getPortalTransactions, getPortalDashboardSummary, triggerPartnerConfirmation, updatePortalTransactionConfirmation } from '../services/api'; 
import PasscodeModal from '../components/PasscodeModal'; // <<< IMPORT NEW COMPONENT
import { FaSyncAlt, FaSearch, FaArrowUp, FaArrowDown, FaCheckCircle, FaTimesCircle, FaSpinner, FaPaperPlane, FaEdit, FaUndo } from 'react-icons/fa';
import Pagination from '../components/Pagination';
import { usePortal } from '../context/PortalContext';
import axios from 'axios';

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const spin = keyframes`
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
`;

const ConfirmationButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1.6rem; /* Bigger icon */
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem;
    border-radius: 50%;
    transition: all 0.2s;

    &:disabled { cursor: not-allowed; opacity: 0.5; }

    &.confirm {
        color: ${({ theme }) => theme.lightText};
        &:hover:not(:disabled) { background-color: #e6fff9; color: #00C49A; }
    }
    &.undo {
        color: ${({ theme }) => theme.lightText};
        &:hover:not(:disabled) { background-color: #ffebe6; color: #DE350B; }
    }
`;

const StatusText = styled.span`
    font-weight: 600;
    font-size: 0.9rem;
    margin-left: 0.5rem;
    color: ${({ confirmed, theme }) => confirmed ? theme.success : theme.lightText};
`;

const NotesCell = styled.div`
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 30px;
    cursor: pointer;
    .notes-text {
        color: ${({ theme }) => theme.text};
        font-style: italic;
    }
    .placeholder {
        color: ${({ theme }) => theme.lightText};
        opacity: 0.7;
    }
    .edit-icon {
        visibility: hidden;
        color: ${({ theme }) => theme.primary};
    }
    &:hover .edit-icon {
        visibility: visible;
    }
`;

const NoteInput = styled.input`
    padding: 0.5rem;
    border: 1px solid ${({ theme }) => theme.secondary};
    border-radius: 4px;
    width: 100%;
    max-width: 180px;
`;

const MobileSection = styled.div`
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid ${({ theme }) => theme.border};
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
`;

const MobileRow = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    .label {
        font-weight: 600;
        color: ${({ theme }) => theme.primary};
    }
`;

const LoadingSpinner = styled(FaSpinner)`
    animation: ${spin} 1s linear infinite;
`;

const PageContainer = styled(motion.div)``;
const ControlsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
`;
const TopControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: flex-start;
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
const DateInput = styled(Input).attrs({ type: "date" })`
  padding-left: 0.75rem;
  min-width: auto;
  font-family: inherit;
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

const ActionButton = styled.button`
  background-color: #e3f2fd;
  color: #0A2540;
  border: 1px solid #bbdefb;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  transition: all 0.2s;
  &:hover { background-color: #bbdefb; }
`;

const Card = styled.div`
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06);
  overflow: hidden;
`;
const TableWrapper = styled.div`
  overflow-x: auto;
  @media (max-width: 768px) {
    display: none;
  }
`;
const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
  th,
  td {
    padding: 1rem 1.5rem;
    text-align: left;
    border-bottom: 1px solid ${({ theme }) => theme.border};
  }
  th {
    background-color: #f6f9fc;
    font-weight: 600;
    color: ${({ theme }) => theme.lightText};
  }
  tr:last-child td {
    border-bottom: none;
  }
`;
const AmountCell = styled.td`
  font-weight: 600;
  font-family: "Courier New", Courier, monospace;
  color: ${({ isCredit, theme }) => (isCredit ? theme.success : theme.error)};
`;
const TypeCell = styled.td`
  font-weight: 700;
  text-transform: uppercase;
  color: ${({ isCredit, theme }) => (isCredit ? theme.success : theme.error)};
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
  background-image: linear-gradient(
    to right,
    #f6f7f8 0%,
    #edeef1 20%,
    #f6f7f8 40%,
    #f6f7f8 100%
  );
  background-repeat: no-repeat;
  background-size: 2000px 100%;
  animation: ${shimmer} 2s linear infinite;
`;
const VolumeContainer = styled.div`
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(3, 1fr);
  @media (max-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;
const VolumeCard = styled.div`
  background: #fff;
  padding: 1rem 1.5rem;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  border-left: 4px solid ${({ theme, color }) => theme[color] || theme.primary};
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
    color: ${({ theme, color }) => theme[color] || theme.primary};
    font-family: "Courier New", Courier, monospace;
  }
  @media (max-width: 768px) {
    ${({ fullWidthOnMobile }) =>
      fullWidthOnMobile && ` grid-column: 1 / -1; `} padding: 0.75rem 1rem;
    h3 {
      font-size: 0.8rem;
    }
    p {
      font-size: 1.5rem;
    }
  }
`;
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
  font-family: "Courier New", Courier, monospace;
  color: ${({ isCredit, theme }) => (isCredit ? theme.success : theme.error)};
`;
const MobileCardBody = styled.div`
  font-size: 0.9rem;
  color: ${({ theme }) => theme.lightText};
  p {
    margin: 0.25rem 0;
  }
  strong {
    color: ${({ theme }) => theme.text};
  }
`;
const SkeletonRow = () => (
  <tr>
    {" "}
    <td colSpan="4">
      <SkeletonCell />
    </td>{" "}
  </tr>
);

const ClientDashboard = () => {
    const [transactions, setTransactions] = useState([]);
    const [summary, setSummary] = useState({ /* ... */ });
    const [loadingTable, setLoadingTable] = useState(true);
    const [loadingSummary, setLoadingSummary] = useState(true);
    const { filters, setFilters } = usePortal();
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
    const debouncedSearch = useDebounce(filters.search, 500);
    const clientData = JSON.parse(localStorage.getItem('portalClient')) || {};

    const [updatingIds, setUpdatingIds] = useState(new Set());
    const [isPasscodeModalOpen, setIsPasscodeModalOpen] = useState(false);
    const [transactionToUpdate, setTransactionToUpdate] = useState(null);
    const [passcodeError, setPasscodeError] = useState('');
     const [editingNoteId, setEditingNoteId] = useState(null);
     const [noteInputText, setNoteInputText] = useState('');

    const handleManualConfirm = async (correlationId) => {
        if (!correlationId) {
            alert('Error: This transaction is not linked to a partner order.');
            return;
        }
        if (!window.confirm(`Manually confirm this payment for the partner store? This will mark their order as PAID.`)) {
            return;
        }
        try {
            // === THE DEFINITIVE FIX: DIRECT API CALL ===
            const token = localStorage.getItem('portalAuthToken');
            if (!token) {
                alert('Authentication error: No portal token found. Please log out and log back in.');
                return;
            }

            await axios.post(
                'https://platform.betaserver.dev:4433/portal/bridge/confirm-payment',
                { correlation_id: correlationId },
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            // ==========================================

            alert(`Confirmation signal sent for order: ${correlationId}`);
            fetchTableData();
        } catch (error) {
            // Use the detailed error from the axios response
            const errorMessage = error.response?.data?.message || 'Failed to send confirmation. Please check the console.';
            console.error("Confirmation Error:", error.response || error);
            alert(errorMessage);
        }
    };

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



    const handleConfirm = async (tx) => {
        if (updatingIds.has(tx.id)) return;
        if (!window.confirm('Confirm this transaction belongs to one of your customers?')) return;
        
        setUpdatingIds(prev => new Set(prev).add(tx.id));
        try {
            await updatePortalTransactionConfirmation(tx.id, tx.source, true);
            setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, is_portal_confirmed: 1 } : t));
        } catch (error) {
            alert('Something went wrong. Please try again.');
        } finally {
            setUpdatingIds(prev => { const newSet = new Set(prev); newSet.delete(tx.id); return newSet; });
        }
    };

    const handlePasscodeSubmit = async (passcode) => {
        if (!transactionToUpdate) return;
        setUpdatingIds(prev => new Set(prev).add(transactionToUpdate.id));
        try {
            await updatePortalTransactionConfirmation(transactionToUpdate.id, transactionToUpdate.source, false, passcode);
            setTransactions(prev => prev.map(t => t.id === transactionToUpdate.id ? { ...t, is_portal_confirmed: 0 } : t));
            setIsPasscodeModalOpen(false);
            setTransactionToUpdate(null);
        } catch (error) {
            if (error.response?.status === 403) { setPasscodeError('Incorrect PIN'); } 
            else { alert('Something went wrong. Please try again.'); setIsPasscodeModalOpen(false); }
        } finally {
            setUpdatingIds(prev => { const newSet = new Set(prev); newSet.delete(transactionToUpdate.id); return newSet; });
        }
    };

    // --- NEW NOTE HANDLERS ---
    const handleNoteClick = (tx) => {
        setEditingNoteId(tx.id);
        setNoteInputText(tx.portal_notes || '');
    };

    const handleNoteUpdate = async (tx) => {
        setUpdatingIds(prev => new Set(prev).add(`note-${tx.id}`));
        try {
            await updatePortalTransactionNotes(tx.id, tx.source, noteInputText);
            setTransactions(prev => prev.map(t => t.id === tx.id ? { ...t, portal_notes: noteInputText.trim() } : t));
        } catch (error) {
            alert('Failed to save note.');
        } finally {
            setEditingNoteId(null);
            setUpdatingIds(prev => { const newSet = new Set(prev); newSet.delete(`note-${tx.id}`); return newSet; });
        }
    };

    const handleInitiateUnconfirm = (tx) => {
        if (updatingIds.has(tx.id)) return;
        setTransactionToUpdate(tx);
        setPasscodeError('');
        setIsPasscodeModalOpen(true);
    };



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
                <Input
                  as="input"
                  name="search"
                  type="text"
                  value={filters.search}
                  onChange={handleFilterChange}
                  placeholder="Search by name, amount..."
                />
              </InputGroup>
              <DateInput
                name="date"
                value={filters.date || ""}
                onChange={handleFilterChange}
              />
              <RefreshButton onClick={() => { fetchTableData(); fetchSummaryData(); }}>
                <FaSyncAlt /> Refresh
              </RefreshButton>
            </FilterContainer>
          </TopControls>

          <VolumeContainer>
            <VolumeCard color="success">
              <h3>IN TRANSACTIONS (BRL)</h3>
              <p>{loadingSummary ? "..." : formatCurrency(summary.dailyTotalIn)}</p>
            </VolumeCard>
            <VolumeCard color="error">
              <h3>OUT TRANSACTIONS (BRL)</h3>
              <p>{loadingSummary ? "..." : formatCurrency(summary.dailyTotalOut)}</p>
            </VolumeCard>
            <VolumeCard color="primary" fullWidthOnMobile>
              <h3>All-Time Balance (BRL)</h3>
              <p>{loadingSummary ? "..." : formatCurrency(summary.allTimeBalance)}</p>
            </VolumeCard>
            <VolumeCard color="success">
              <h3># Transactions (IN)</h3>
              <p>{loadingSummary ? "..." : formatNumber(summary.dailyCountIn)}</p>
            </VolumeCard>
            <VolumeCard color="error">
              <h3># Transactions (OUT)</h3>
              <p>{loadingSummary ? "..." : formatNumber(summary.dailyCountOut)}</p>
            </VolumeCard>
             <VolumeCard color="primary">
              <h3># Total Transactions</h3>
              <p>{loadingSummary ? "..." : formatNumber(summary.dailyCountTotal)}</p>
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
                    {clientData.username === 'xplus' && <th>Partner Actions</th>}
                    <th>Confirmation</th> {/* <<< NEW COLUMN HEADER */}
                    <th>Operator Notes</th>
                </tr>
              </thead>
              <tbody>
                {loadingTable ? (
                  [...Array(10)].map((_, i) => ( <tr><td colSpan={clientData.username === 'xplus' ? 5 : 4}><SkeletonCell /></td></tr> ))
                ) : transactions.length === 0 ? (
                  <tr><td colSpan={clientData.username === 'xplus' ? 5 : 4}><EmptyStateContainer><h3>No transactions found</h3></EmptyStateContainer></td></tr>
                ) : (
                  transactions.map((tx) => {
                    const isCredit = tx.operation_direct === "in" || tx.operation_direct === "C";
                    const isConfirmed = tx.bridge_status === 'paid' || tx.bridge_status === 'paid_manual';
                    const isConfirmedByPortal = tx.is_portal_confirmed;
                    const isUpdating = updatingIds.has(tx.id);
                    const isEditingNote = editingNoteId === tx.id;
                    const isUpdatingNote = updatingIds.has(`note-${tx.id}`);
                    return (
                        <motion.tr key={tx.id}>
                            <td>{formatDateTime(tx.transaction_date)}</td>
                            <TypeCell isCredit={isCredit}>{isCredit ? "IN" : "OUT"}</TypeCell>
                            <td>{isCredit ? (tx.sender_name || "Unknown") : (tx.counterparty_name || "Unknown")}</td>
                            <AmountCell isCredit={isCredit}>{formatCurrency(tx.amount)}</AmountCell>
                            
                            {clientData.username === 'xplus' && (
                                <td>
                                    {isCredit && tx.correlation_id && (
                                        isConfirmed ? (
                                            <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600' }}>
                                                <FaCheckCircle /> Confirmed
                                            </span>
                                        ) : (
                                            <ActionButton onClick={() => handleManualConfirm(tx.correlation_id)}>
                                                <FaPaperPlane /> Confirm
                                            </ActionButton>
                                        )
                                    )}
                                </td>
                            )}
                            <td style={{ textAlign: 'center' }}>
                              {isUpdating ? (
                                  <LoadingSpinner />
                              ) : isConfirmedByPortal ? (
                                  <ConfirmationButton
                                      className="undo"
                                      onClick={() => handleInitiateUnconfirm(tx)}
                                      title="Undo Confirmation"
                                  >
                                      <FaUndo />
                                  </ConfirmationButton>
                              ) : (
                                  <ConfirmationButton
                                      className="confirm"
                                      onClick={() => handleConfirm(tx)}
                                      title="Confirm Transaction"
                                  >
                                      <FaCheckCircle />
                                  </ConfirmationButton>
                              )}
                          </td>
                          <td>
                                {isEditingNote ? (
                                    <NoteInput
                                        autoFocus
                                        value={noteInputText}
                                        onChange={(e) => setNoteInputText(e.target.value)}
                                        onBlur={() => handleNoteUpdate(tx)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleNoteUpdate(tx); }}
                                        maxLength="25"
                                    />
                                ) : isUpdatingNote ? <LoadingSpinner/> : (
                                    <NotesCell onClick={() => handleNoteClick(tx)}>
                                        {tx.portal_notes ? (
                                            <span className="notes-text">{tx.portal_notes}</span>
                                        ) : (
                                            <span className="placeholder">Add note...</span>
                                        )}
                                        <FaEdit className="edit-icon" />
                                    </NotesCell>
                                )}
                            </td>
                        </motion.tr>
                    );
                  })
                )}
              </tbody>
            </Table>
          </TableWrapper>
          <MobileListContainer>
            {loadingTable ? (
              <p>Loading...</p>
            ) : transactions.length === 0 ? (
                <EmptyStateContainer><h3>No transactions found</h3></EmptyStateContainer>
            ) : (
              transactions.map((tx) => {
                const isCredit = tx.operation_direct === "in" || tx.operation_direct === "C";
                const isConfirmed = tx.bridge_status === 'paid' || tx.bridge_status === 'paid_manual';
                const isConfirmedByPortal = !!tx.is_portal_confirmed;
                const isUpdatingConfirmation = updatingIds.has(tx.id);
                const isEditingNote = editingNoteId === tx.id;
                const isUpdatingNote = updatingIds.has(`note-${tx.id}`);
                return (
                    <MobileCard key={tx.id} isCredit={isCredit} variants={itemVariants}>
                        <MobileCardHeader isCredit={isCredit}>
                            <span>{isCredit ? "+" : "-"} {formatCurrency(tx.amount)}</span>
                            <span>{isCredit ? <FaArrowUp /> : <FaArrowDown />}</span>
                        </MobileCardHeader>
                        <MobileCardBody>
                            <p><strong>{isCredit ? (tx.sender_name || "Unknown") : (tx.counterparty_name || "Unknown Receiver")}</strong></p>
                            <p>{formatDateTime(tx.transaction_date)}</p>
                        </MobileCardBody>

                        <MobileSection>
                            <MobileRow>
                                <span className='label'>Confirmation</span>
                                <div style={{ display: 'flex', alignItems: 'center' }}>
                                    {isUpdatingConfirmation ? <LoadingSpinner/> : 
                                    isConfirmedByPortal ? (
                                        <ConfirmationButton className="undo" onClick={() => handleInitiateUnconfirm(tx)}><FaTimesCircle style={{color: '#DE350B'}}/></ConfirmationButton>
                                    ) : (
                                        <ConfirmationButton className="confirm" onClick={() => handleConfirm(tx)}><FaCheckCircle style={{color: '#00C49A'}}/></ConfirmationButton>
                                    )}
                                    <StatusText confirmed={isConfirmedByPortal}>
                                        {isConfirmedByPortal ? 'Confirmed' : 'Pending'}
                                    </StatusText>
                                </div>
                            </MobileRow>
                            <MobileRow>
                                <span className='label'>Notes</span>
                                {isEditingNote ? (
                                    <NoteInput autoFocus value={noteInputText} onChange={(e) => setNoteInputText(e.target.value)} onBlur={() => handleNoteUpdate(tx)} onKeyDown={(e) => { if (e.key === 'Enter') handleNoteUpdate(tx); }} maxLength="25"/>
                                ) : isUpdatingNote ? <LoadingSpinner/> : (
                                    <NotesCell onClick={() => handleNoteClick(tx)}>
                                        {tx.portal_notes ? <span className="notes-text">{tx.portal_notes}</span> : <span className="placeholder">Add note...</span>}
                                        <FaEdit className="edit-icon"/>
                                    </NotesCell>
                                )}
                            </MobileRow>
                        </MobileSection>

                        {clientData.username === 'xplus' && isCredit && tx.correlation_id && (
                            <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid #eee' }}>
                                {isConfirmed ? (
                                    <span style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: '600', fontSize: '0.9rem' }}>
                                        <FaCheckCircle /> Partner Confirmed
                                    </span>
                                ) : (
                                    <ActionButton onClick={() => handleManualConfirm(tx.correlation_id)}>
                                        <FaPaperPlane /> Confirm for Partner
                                    </ActionButton>
                                )}
                            </div>
                        )}
                    </MobileCard>
                );
              })
            )}
          </MobileListContainer>
          <Pagination pagination={pagination} setPagination={setPagination} />
        </Card>
        <PasscodeModal 
            isOpen={isPasscodeModalOpen}
            onClose={() => setIsPasscodeModalOpen(false)}
            onSubmit={handlePasscodeSubmit}
            error={passcodeError}
            clearError={() => setPasscodeError('')}
        />
      </PageContainer>
    );
};

export default ClientDashboard;