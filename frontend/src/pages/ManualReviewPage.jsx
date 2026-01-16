import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { 
    getPendingManualInvoices, 
    confirmManualInvoice, 
    rejectManualInvoice, 
    viewInvoiceMedia, 
    clearAllPendingInvoices
} from '../services/api';
import { useSocket } from '../context/SocketContext';
import Modal from '../components/Modal';
import { FaCheck, FaTimes, FaBroom } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
`;

// --- MODIFIED: Renamed component for clarity and added new button ---
const ActionButtonContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 1rem;
`;

const HeaderButton = styled.button`
    background-color: ${({ theme, danger }) => danger ? theme.error : theme.primary};
    color: white;
    border: none;
    padding: 0.6rem 1.2rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid #eee;
        vertical-align: middle;
    }
    th { background: #f9f9f9; }
`;

// --- NEW: Styled component for selected rows ---
const TableRow = styled.tr`
    background-color: ${({ isSelected }) => isSelected ? '#e3f2fd' : 'transparent'};
    transition: background-color 0.2s;
`;

const ActionCellButton = styled.button`
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-right: 0.5rem;
    
    &.confirm { background-color: #E3FCEF; color: #006644; &:hover { background-color: #d1f7e2; } }
    &.reject { background-color: #FFEBE6; color: #DE350B; &:hover { background-color: #ffded6; } }
`;

// --- NEW: Styled component for the single-row clear button ---
const ClearRowButton = styled.button`
    background: transparent;
    border: none;
    cursor: pointer;
    color: ${({ theme }) => theme.lightText};
    font-size: 1.1rem;
    &:hover {
        color: ${({ theme }) => theme.primary};
    }
`;

const MediaLink = styled.button`
    background: none;
    border: none;
    color: ${({ theme }) => theme.primary};
    cursor: pointer;
    text-decoration: underline;
`;

const Checkbox = styled.input.attrs({ type: 'checkbox' })`
    width: 18px;
    height: 18px;
    cursor: pointer;
`;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const formatSaoPauloDateTime = (dbDateString, formatString) => {
    if (!dbDateString) return '';
    try {
        const utcDate = new Date(dbDateString + 'Z');
        return formatInTimeZone(utcDate, SAO_PAULO_TIMEZONE, formatString);
    } catch (e) {
        console.warn("Could not format date:", dbDateString);
        return dbDateString;
    }
};

const ManualReviewPage = () => {
    const socket = useSocket();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
    
    // --- NEW: State for managing selections ---
    const [selectedRows, setSelectedRows] = useState(new Set());

    const fetchPending = async () => {
        setLoading(true);
        try {
            const { data } = await getPendingManualInvoices();
            setInvoices(data);
            setSelectedRows(new Set()); // Clear selection on refresh
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchPending();
        if (socket) {
            socket.on('manual:refresh', fetchPending);
            return () => socket.off('manual:refresh', fetchPending);
        }
    }, [socket]);
    
    // --- START: NEW HANDLER FUNCTIONS ---
    const handleSelectRow = (messageId) => {
        const newSelection = new Set(selectedRows);
        if (newSelection.has(messageId)) {
            newSelection.delete(messageId);
        } else {
            newSelection.add(messageId);
        }
        setSelectedRows(newSelection);
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            const allMessageIds = new Set(invoices.map(inv => inv.message_id));
            setSelectedRows(allMessageIds);
        } else {
            setSelectedRows(new Set());
        }
    };

    const handleClear = async (messageIdsToClear, isBulk = false) => {
        const count = messageIdsToClear.length;
        if (count === 0) return;
        
        const confirmText = isBulk
            ? `Are you sure you want to CLEAR the ${count} selected invoices from this list?`
            : `Are you sure you want to CLEAR this invoice from the list?`;
        
        if (!window.confirm(confirmText + "\nThis will NOT send a reply to the clients.")) {
            return;
        }

        try {
            await clearAllPendingInvoices(messageIdsToClear);
            // The socket event will trigger a refresh, but we can also do it manually
            // fetchPending();
        } catch (e) {
            alert('An error occurred while trying to clear the item(s).');
        }
    };
    // --- END: NEW HANDLER FUNCTIONS ---

    const handleReject = async (invoice) => {
        if (!window.confirm('Are you sure you want to REJECT this invoice? This will reply "no caiu" to the client.')) return;
        try {
            await rejectManualInvoice(invoice.message_id);
        } catch (e) { alert('Failed to reject.'); }
    };

    const openConfirmModal = async (invoice) => {
        setSelectedInvoice(invoice);
        setIsModalOpen(true);
        setLoadingCandidates(true);
        try {
            const amount = parseFloat(invoice.amount.replace(/,/g, ''));
            const { data: allCandidates } = await getManualCandidates(amount, invoice.recipient_name);
            setCandidates(allCandidates);
        } catch (e) { 
            console.error(e); 
            setCandidates([]); 
        } finally { 
            setLoadingCandidates(false); 
        }
    };

    const handleFinalConfirm = async (linkedTx = null) => {
        if (!selectedInvoice) return;
        const confirmText = linkedTx
            ? `Link this ${linkedTx.source} transaction and confirm the invoice?`
            : `Force confirm this invoice without linking a bank transaction?`;
        if (!window.confirm(confirmText + '\nThis will reply "Caiu" to the client.')) return;
        
        try {
            setIsModalOpen(false);
            await confirmManualInvoice({
                messageId: selectedInvoice.message_id,
                linkedTransactionId: linkedTx ? linkedTx.id : null,
                source: linkedTx ? linkedTx.source : null
            });
        } catch (e) { 
            alert(e.response?.data?.message || 'Failed to confirm.'); 
        }
    };
    
    // --- NEW: Memoized value for the "select all" checkbox state ---
    const areAllSelected = useMemo(() => {
        return invoices.length > 0 && selectedRows.size === invoices.length;
    }, [selectedRows, invoices]);

    return (
        <PageContainer>
            <Header>
                <h2>Manual Confirmation Center</h2>
                <ActionButtonContainer>
                    {/* --- MODIFIED: Clear Selected Button --- */}
                    <HeaderButton onClick={() => handleClear(Array.from(selectedRows), true)} disabled={selectedRows.size === 0}>
                        <FaBroom /> Clear Selected ({selectedRows.size})
                    </HeaderButton>
                    {/* --- MODIFIED: Clear All Button --- */}
                    <HeaderButton danger onClick={() => handleClear(invoices.map(inv => inv.message_id), true)} disabled={invoices.length === 0}>
                        <FaBroom /> Clear All ({invoices.length})
                    </HeaderButton>
                    <div style={{background: '#E3FCEF', color: '#006644', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold'}}>
                        {invoices.length} Pending
                    </div>
                </ActionButtonContainer>
            </Header>
            
            <Card>
                {loading ? <p>Loading...</p> : (
                    <Table>
                        <thead>
                            <tr>
                                {/* --- MODIFIED: Select All Checkbox --- */}
                                <th><Checkbox onChange={handleSelectAll} checked={areAllSelected} /></th>
                                <th>Date</th>
                                <th>Source Group</th>
                                <th>Sender</th>
                                <th>Recipient</th>
                                <th>Amount</th>
                                <th>Media</th>
                                <th>Confirm/Reject</th>
                                {/* --- MODIFIED: Actions Column --- */}
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.length === 0 ? (<tr><td colSpan="9" style={{textAlign: 'center'}}>All caught up!</td></tr>) :
                            invoices.map(inv => (
                                <tr key={inv.id} isSelected={selectedRows.has(inv.message_id)}>
                                    {/* --- MODIFIED: Row Checkbox --- */}
                                    <td>
                                        <Checkbox 
                                            checked={selectedRows.has(inv.message_id)} 
                                            onChange={() => handleSelectRow(inv.message_id)} 
                                        />
                                    </td>
                                    <td>{formatSaoPauloDateTime(inv.received_at, 'dd/MM HH:mm')}</td>
                                    <td>{inv.source_group_name}</td>
                                    <td>{inv.sender_name}</td>
                                    <td>{inv.recipient_name}</td>
                                    <td style={{fontWeight: 'bold'}}>{inv.amount}</td>
                                    <td>
                                        <MediaLink onClick={() => viewInvoiceMedia(inv.id)}>View Image</MediaLink>
                                    </td>
                                    <td>
                                        <ActionCellButton className="confirm" onClick={() => openConfirmModal(inv)}>
                                            <FaCheck /> Confirm
                                        </ActionCellButton>
                                        <ActionCellButton className="reject" onClick={() => handleReject(inv)}>
                                            <FaTimes /> Reject
                                        </ActionCellButton>
                                    </td>
                                    {/* --- MODIFIED: Single Row Clear Button --- */}
                                    <td style={{textAlign: 'center'}}>
                                        <ClearRowButton title="Clear this item" onClick={() => handleClear([inv.message_id], false)}>
                                            <FaBroom />
                                        </ClearRowButton>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                )}
            </Card>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} maxWidth="800px">
                <h2>Link Bank Transaction</h2>
                <p>Select the matching transaction from the database to reconcile accounting. <br/>
                   <strong>Invoice Amount: {selectedInvoice?.amount}</strong>
                </p>

                {loadingCandidates ? <p>Searching database...</p> : (
                    <div style={{maxHeight: '400px', overflowY: 'auto', margin: '1rem 0', border: '1px solid #eee'}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem'}}>
                            <thead style={{background: '#f9f9f9', position: 'sticky', top: 0}}>
                                <tr>
                                    <th style={{padding: '0.5rem'}}>Source</th>
                                    <th style={{padding: '0.5rem'}}>Date</th>
                                    <th style={{padding: '0.5rem'}}>Name</th>
                                    <th style={{padding: '0.5rem'}}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {candidates.length === 0 ? (
                                    <tr><td colSpan="4" style={{padding: '1rem', textAlign: 'center'}}>No unused transactions found for this amount.</td></tr>
                                ) : candidates.map(cand => (
                                    <tr key={cand.id + cand.source} style={{borderBottom: '1px solid #eee'}}>
                                        <td style={{padding: '0.5rem'}}>{cand.source}</td>
                                        <td>{formatSaoPauloDateTime(cand.date, 'dd/MM HH:mm')}</td>
                                        <td style={{padding: '0.5rem', fontWeight: 'bold'}}>{cand.name}</td>
                                        <td style={{padding: '0.5rem'}}>
                                            <button 
                                                onClick={() => handleFinalConfirm(cand)}
                                                style={{padding: '0.3rem 0.8rem', background: '#00C49A', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}
                                            >
                                                Link & Confirm
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #eee'}}>
                    <button 
                        onClick={() => handleFinalConfirm(null)} 
                        style={{background: 'transparent', border: '1px solid #666', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer'}}
                    >
                        Force Confirm (Without Linking)
                    </button>
                    <span style={{marginLeft: '1rem', fontSize: '0.8rem', color: '#666'}}>Use this if the bank API hasn't synced yet.</span>
                </div>
            </Modal>
        </PageContainer>
    );
};

export default ManualReviewPage;