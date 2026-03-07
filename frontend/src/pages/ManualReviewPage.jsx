import React, { useState, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { 
    getPendingManualInvoices, 
    confirmManualInvoice, 
    getManualCandidates,
    rejectManualInvoice, 
    viewInvoiceMedia, 
    clearAllPendingInvoices
} from '../services/api';
import { useSocket } from '../context/SocketContext';
import { usePermissions } from '../context/PermissionContext';
import Modal from '../components/Modal';
import { FaCheck, FaTimes, FaBroom } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.2rem;
    height: 100%;
    min-height: 0;
    overflow: hidden;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
`;

const SummaryBadge = styled.div`
    background: #e3fcef;
    color: #006644;
    padding: 0.5rem 0.85rem;
    border-radius: 999px;
    font-weight: 700;
`;

const ActionButtonContainer = styled.div`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
    justify-content: flex-end;
`;

const HeaderButton = styled.button`
    background-color: ${({ theme, danger }) => danger ? theme.error : theme.primary};
    color: white;
    border: none;
    padding: 0.58rem 0.9rem;
    border-radius: 8px;
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
    padding: 1.1rem 1.2rem 1rem;
    border-radius: 14px;
    border: 1px solid rgba(9, 30, 66, 0.08);
    box-shadow: 0 14px 30px rgba(9, 30, 66, 0.08);
    display: flex;
    flex-direction: column;
    min-height: 0;

    &:last-child {
        flex: 1;
    }
`;

const TableWrapper = styled.div`
    width: 100%;
    overflow: auto;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 10px;
    min-height: 0;
    flex: 1;
`;

const Table = styled.table`
    width: 100%;
    min-width: 1080px;
    border-collapse: collapse;
    font-size: 0.9rem;
    th, td {
        padding: 0.78rem 0.85rem;
        text-align: left;
        border-bottom: 1px solid #eee;
        vertical-align: middle;
        white-space: nowrap;
    }
    th { background: #f9f9f9; font-size: 0.84rem; letter-spacing: 0.01em; }
`;

const TableRow = styled.tr`
    background-color: ${({ isSelected }) => isSelected ? '#e3f2fd' : 'transparent'};
    transition: background-color 0.2s;
`;

const ActionCellButton = styled.button`
    border: none;
    padding: 0.46rem 0.72rem;
    border-radius: 8px;
    cursor: pointer;
    font-weight: bold;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin-right: 0.5rem;
    
    &.confirm { background-color: #E3FCEF; color: #006644; &:hover { background-color: #d1f7e2; } }
    &.reject { background-color: #FFEBE6; color: #DE350B; &:hover { background-color: #ffded6; } }
`;

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
    const { hasPermission } = usePermissions();
    const canConfirm = hasPermission('manual_review:confirm');
    const canReject = hasPermission('manual_review:reject');
    const canClear = hasPermission('manual_review:clear');

    const socket = useSocket();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);
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
        
        const confirmText = isBulk ? `Are you sure you want to CLEAR the ${count} selected invoices?` : `Are you sure you want to CLEAR this invoice?`;
        
        if (!window.confirm(confirmText + "\nThis will NOT send a reply to the clients.")) { return; }
        try {
            await clearAllPendingInvoices(messageIdsToClear);
        } catch (e) {
            alert('An error occurred while trying to clear the item(s).');
        }
    };

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
    
    const areAllSelected = useMemo(() => {
        return invoices.length > 0 && selectedRows.size === invoices.length;
    }, [selectedRows, invoices]);

    const tableColumnCount = (canClear ? 1 : 0) + 6 + ((canConfirm || canReject) ? 1 : 0) + (canClear ? 1 : 0);

    return (
        <PageContainer>
            <Header>
                <h2>Manual Confirmation Center</h2>
                <ActionButtonContainer>
                    {canClear && (
                        <>
                            <HeaderButton onClick={() => handleClear(Array.from(selectedRows), true)} disabled={selectedRows.size === 0}>
                                <FaBroom /> Clear Selected ({selectedRows.size})
                            </HeaderButton>
                            <HeaderButton danger onClick={() => handleClear(invoices.map(inv => inv.message_id), true)} disabled={invoices.length === 0}>
                                <FaBroom /> Clear All ({invoices.length})
                            </HeaderButton>
                        </>
                    )}
                    <SummaryBadge>
                        {invoices.length} Pending
                    </SummaryBadge>
                </ActionButtonContainer>
            </Header>
            
            <Card>
                {loading ? <p>Loading...</p> : (
                    <TableWrapper>
                        <Table>
                            <thead>
                                <tr>
                                    {canClear && <th><Checkbox onChange={handleSelectAll} checked={areAllSelected} /></th>}
                                    <th>Date</th>
                                    <th>Source Group</th>
                                    <th>Sender</th>
                                    <th>Recipient</th>
                                    <th>Amount</th>
                                    <th>Media</th>
                                    {(canConfirm || canReject) && <th>Confirm/Reject</th>}
                                    {canClear && <th>Actions</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {invoices.length === 0 ? (<tr><td colSpan={tableColumnCount} style={{textAlign: 'center'}}>All caught up!</td></tr>) :
                                invoices.map(inv => (
                                    <TableRow key={inv.id} isSelected={selectedRows.has(inv.message_id)}>
                                        {canClear && (
                                            <td>
                                                <Checkbox 
                                                    checked={selectedRows.has(inv.message_id)} 
                                                    onChange={() => handleSelectRow(inv.message_id)} 
                                                />
                                            </td>
                                        )}
                                        <td>{formatSaoPauloDateTime(inv.received_at, 'dd/MM HH:mm')}</td>
                                        <td>{inv.source_group_name}</td>
                                        <td>{inv.sender_name}</td>
                                        <td>{inv.recipient_name}</td>
                                        <td style={{fontWeight: 'bold'}}>{inv.amount}</td>
                                        <td><MediaLink onClick={() => viewInvoiceMedia(inv.id)}>View Image</MediaLink></td>
                                        
                                        {(canConfirm || canReject) && (
                                            <td>
                                                {canConfirm && (
                                                    <ActionCellButton className="confirm" onClick={() => openConfirmModal(inv)}>
                                                        <FaCheck /> Confirm
                                                    </ActionCellButton>
                                                )}
                                                {canReject && (
                                                    <ActionCellButton className="reject" onClick={() => handleReject(inv)}>
                                                        <FaTimes /> Reject
                                                    </ActionCellButton>
                                                )}
                                            </td>
                                        )}
                                        {canClear && (
                                            <td style={{textAlign: 'center'}}>
                                                <ClearRowButton title="Clear this item" onClick={() => handleClear([inv.message_id], false)}>
                                                    <FaBroom />
                                                </ClearRowButton>
                                            </td>
                                        )}
                                    </TableRow>
                                ))}
                            </tbody>
                        </Table>
                    </TableWrapper>
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
