import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { 
    getPendingManualInvoices, 
    getManualCandidates, 
    confirmManualInvoice, 
    rejectManualInvoice, 
    viewInvoiceMedia, 
    clearAllPendingInvoices // <-- IMPORT THE NEW FUNCTION
} from '../services/api';
import { useSocket } from '../context/SocketContext';
import Modal from '../components/Modal';
import { FaCheck, FaTimes, FaMagic, FaBroom } from 'react-icons/fa';
import { format } from 'date-fns';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

// === MODIFIED: Renamed component for clarity ===
const ClearAllButton = styled.button`
    background-color: ${({ theme }) => theme.primary};
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
    }
    th { background: #f9f9f9; }
`;

const ActionButton = styled.button`
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

const MediaLink = styled.button`
    background: none;
    border: none;
    color: ${({ theme }) => theme.primary};
    cursor: pointer;
    text-decoration: underline;
`;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const ManualReviewPage = () => {
    const socket = useSocket();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [loadingCandidates, setLoadingCandidates] = useState(false);

    const fetchPending = async () => {
        setLoading(true);
        try {
            const { data } = await getPendingManualInvoices();
            setInvoices(data);
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

    const handleReject = async (invoice) => {
        if (!window.confirm('Are you sure you want to REJECT this invoice? This will reply "no caiu" to the client.')) return;
        try {
            await rejectManualInvoice(invoice.message_id);
        } catch (e) { alert('Failed to reject.'); }
    };

    const handleClearAll = async () => {
        if (!window.confirm(`Are you sure you want to CLEAR all ${invoices.length} pending invoices from this list? This will NOT send a confirmation to the clients.`)) return;
        try {
            const messageIds = invoices.map(inv => inv.message_id);
            await clearAllPendingInvoices(messageIds);
        } catch (e) {
            alert('An error occurred while trying to clear the list.');
        }
    };

    const openConfirmModal = async (invoice) => {
        setSelectedInvoice(invoice);
        setIsModalOpen(true);
        setLoadingCandidates(true);
        try {
            const amount = parseFloat(invoice.amount.replace(/,/g, ''));
            const { data: allCandidates } = await getManualCandidates(amount);
            
            // --- NEW: Filter logic ---
            const recipientName = (invoice.recipient_name || '').toLowerCase();
            const filtered = allCandidates.filter(cand => {
                if (recipientName.includes('upgrade zone')) {
                    return cand.source === 'XPayz';
                }
                if (recipientName.includes('cross') || recipientName.includes('trkbit')) {
                    return cand.source === 'Trkbit';
                }
                // Add more rules here if needed
                return true; // Show all if no specific rule matches
            });

            setCandidates(filtered);
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

    return (
        <PageContainer>
            <Header>
                <h2>Manual Confirmation Center</h2>
                <div style={{display: 'flex', alignItems: 'center', gap: '1rem'}}>
                    <ClearAllButton onClick={handleClearAll} disabled={invoices.length === 0}>
                        <FaBroom /> Clear All ({invoices.length})
                    </ClearAllButton>
                    <div style={{background: '#E3FCEF', color: '#006644', padding: '0.5rem 1rem', borderRadius: '20px', fontWeight: 'bold'}}>
                        {invoices.length} Pending
                    </div>
                </div>
            </Header>
            
            <Card>
                {loading ? <p>Loading...</p> : (
                    <Table>
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Source Group</th>
                                <th>Sender</th>
                                <th>Recipient</th> {/* <-- NEW COLUMN */}
                                <th>Amount</th>
                                <th>Media</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoices.length === 0 ? (<tr><td colSpan="7">All caught up!</td></tr>) :
                            invoices.map(inv => (
                                <tr key={inv.id}>
                                    <td>{formatInTimeZone(new Date(inv.received_at), SAO_PAULO_TIMEZONE, 'dd/MM HH:mm')}</td>
                                    <td>{inv.source_group_name}</td>
                                    <td>{inv.sender_name}</td>
                                    <td>{inv.recipient_name}</td> {/* <-- NEW COLUMN */}
                                    <td style={{fontWeight: 'bold'}}>{inv.amount}</td>
                                    <td>
                                        <MediaLink onClick={() => viewInvoiceMedia(inv.id)}>View Image</MediaLink>
                                    </td>
                                    <td>
                                        <ActionButton className="confirm" onClick={() => openConfirmModal(inv)}>
                                            <FaCheck /> Confirm
                                        </ActionButton>
                                        <ActionButton className="reject" onClick={() => handleReject(inv)}>
                                            <FaTimes /> Reject
                                        </ActionButton>
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
                                        <td style={{padding: '0.5rem'}}>{format(new Date(cand.date), 'dd/MM HH:mm')}</td>
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