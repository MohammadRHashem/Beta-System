import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getTrkbitTransactions, exportTrkbit, getSubaccounts, reassignTrkbitTransaction } from '../services/api';
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK
import { FaFileExcel, FaSearch, FaLink, FaUnlink, FaExchangeAlt } from 'react-icons/fa';
import Modal from '../components/Modal';
import Pagination from '../components/Pagination';
import LinkInvoiceModal from '../components/LinkInvoiceModal';

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

const Title = styled.h2` margin: 0; `;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    background-color: #217346;
    color: white;
    font-size: 0.9rem;
`;

const FilterContainer = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    display: flex;
    gap: 1rem;
    align-items: flex-end;
    flex-wrap: wrap;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Input = styled.input`
    padding: 0.6rem;
    border: 1px solid #ddd;
    border-radius: 4px;
`;

const TableWrapper = styled.div`
    background: #fff;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    overflow-x: auto;
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

const ActionIcon = styled.span`
    cursor: pointer;
    font-size: 1.1rem;
    color: ${({ theme, linked }) => linked ? theme.success : theme.lightText};
    &:hover {
        color: ${({ theme, linked }) => linked ? theme.success : theme.primary};
    }
`;

const TrkbitPage = () => {
    const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
    const canExport = hasPermission('finance:view_bank_statements');
    const canLink = hasPermission('invoice:link');
    const canReassign = hasPermission('trkbit:reassign');
    const tableColSpan = 5 + (canLink ? 1 : 0) + (canReassign ? 1 : 0);

    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [pixKeyOptions, setPixKeyOptions] = useState([]);
    const [isReassignOpen, setIsReassignOpen] = useState(false);
    const [reassignTx, setReassignTx] = useState(null);
    const [targetPixKey, setTargetPixKey] = useState('');
    const [reassignReason, setReassignReason] = useState('');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filters, page: pagination.page, limit: pagination.limit };
            const { data } = await getTrkbitTransactions(params);
            setTransactions(data.transactions);
            setPagination(prev => ({
                ...prev,
                totalPages: data.totalPages,
                totalRecords: data.totalRecords
            }));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.page, pagination.limit]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const fetchPixKeys = async () => {
            try {
                const { data } = await getSubaccounts();
                const optionsMap = new Map();
                (data || [])
                    .filter((acc) => acc.account_type === 'cross')
                    .forEach((acc) => {
                        if (acc.chave_pix) {
                            optionsMap.set(acc.chave_pix, `${acc.name} (${acc.chave_pix})`);
                        }
                        if (acc.geral_pix_key) {
                            optionsMap.set(acc.geral_pix_key, `${acc.name} - Geral (${acc.geral_pix_key})`);
                        }
                    });
                setPixKeyOptions(Array.from(optionsMap.entries()).map(([value, label]) => ({ value, label })));
            } catch (error) {
                console.error('Failed to fetch Cross keys', error);
                setPixKeyOptions([]);
            }
        };
        fetchPixKeys();
    }, []);

    const handleExport = () => {
        exportTrkbit(filters);
    };

    const formatAdjustedDate = (dateString) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            date.setHours(date.getHours() - 3);
            return new Intl.DateTimeFormat('pt-BR', {
                year: 'numeric', month: '2-digit', day: '2-digit',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            }).format(date);
        } catch {
            return dateString;
        }
    };

    const openLinkModal = (tx) => {
        // 3. CHECK PERMISSION BEFORE ALLOWING ACTION
        if (!canLink) {
            alert("You do not have permission to link invoices.");
            return;
        }
        setSelectedTransaction({ id: tx.uid, amount: tx.amount, source: 'Trkbit' });
        setIsLinkModalOpen(true);
    };

    const openReassignModal = (tx) => {
        if (!canReassign) {
            alert("You do not have permission to reassign transactions.");
            return;
        }
        setReassignTx(tx);
        setTargetPixKey('');
        setReassignReason('');
        setIsReassignOpen(true);
    };

    const handleReassign = async (e) => {
        e.preventDefault();
        if (!reassignTx || !targetPixKey) return;
        try {
            await reassignTrkbitTransaction({
                transactionId: reassignTx.id,
                targetPixKey,
                reason: reassignReason
            });
            setIsReassignOpen(false);
            fetchData();
        } catch (error) {
            alert(error.response?.data?.message || 'Failed to reassign transaction.');
        }
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Trkbit Transactions</Title>
                    {/* 4. WRAP EXPORT BUTTON IN PERMISSION CHECK */}
                    {canExport && (
                        <Button onClick={handleExport}><FaFileExcel /> Export Excel</Button>
                    )}
                </Header>

                <FilterContainer>
                    <InputGroup>
                        <label>Search</label>
                        <Input type="text" value={filters.search} onChange={e => setFilters({...filters, search: e.target.value})} placeholder="Payer, ID..." />
                    </InputGroup>
                    <InputGroup>
                        <label>Date From</label>
                        <Input type="date" value={filters.dateFrom} onChange={e => setFilters({...filters, dateFrom: e.target.value})} />
                    </InputGroup>
                    <InputGroup>
                        <label>Date To</label>
                        <Input type="date" value={filters.dateTo} onChange={e => setFilters({...filters, dateTo: e.target.value})} />
                    </InputGroup>
                    <button onClick={fetchData} style={{padding: '0.6rem 1rem', background: '#0A2540', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer'}}>Search</button>
                </FilterContainer>

                <TableWrapper>
                    <Table>
                        <thead>
                            <tr>
                                <th>Date/Time</th>
                                <th>Payer Name</th>
                                <th>Amount</th>
                                <th>Tx ID</th>
                                <th>Pix Key</th>
                                {canLink && <th>Link Status</th>}
                                {canReassign && <th>Actions</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan={tableColSpan}>Loading...</td></tr> : transactions.map(tx => (
                                <tr key={tx.id}>
                                    <td>{formatAdjustedDate(tx.tx_date)}</td>
                                    <td>{tx.tx_payer_name}</td>
                                    <td style={{color: '#217346', fontWeight: 'bold'}}>
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                    </td>
                                    <td>{tx.tx_id}</td>
                                    <td>{tx.tx_pix_key || '-'}</td>
                                    {/* 5. WRAP LINK STATUS CELL IN PERMISSION CHECK */}
                                    {canLink && (
                                        <td style={{ textAlign: 'center' }}>
                                            {tx.is_used || tx.linked_invoice_id ? (
                                                <ActionIcon linked={true} title={`Linked to Invoice ID: ${tx.linked_invoice_message_id}`}>
                                                    <FaLink />
                                                </ActionIcon>
                                            ) : (
                                                <ActionIcon linked={false} onClick={() => openLinkModal(tx)} title="Link to Invoice">
                                                    <FaUnlink />
                                                </ActionIcon>
                                            )}
                                        </td>
                                    )}
                                    {canReassign && (
                                        <td>
                                            <ActionIcon linked={false} onClick={() => openReassignModal(tx)} title="Reassign PIX Key">
                                                <FaExchangeAlt />
                                            </ActionIcon>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </TableWrapper>
                <Pagination pagination={pagination} setPagination={setPagination} />
            </PageContainer>
            {/* Modal is implicitly protected */}
            {canLink && (
                <LinkInvoiceModal 
                    isOpen={isLinkModalOpen}
                    onClose={() => { setIsLinkModalOpen(false); fetchData(); }}
                    transaction={selectedTransaction}
                />
            )}
            {canReassign && reassignTx && (
                <Modal isOpen={isReassignOpen} onClose={() => setIsReassignOpen(false)} maxWidth="480px">
                    <h2>Reassign PIX Key</h2>
                    <form onSubmit={handleReassign} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <label style={{ fontWeight: 600 }}>Target PIX Key</label>
                        <select value={targetPixKey} onChange={(e) => setTargetPixKey(e.target.value)} required style={{ padding: '0.6rem', borderRadius: '4px', border: '1px solid #ddd' }}>
                            <option value="">Select PIX Key</option>
                            {pixKeyOptions.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <label style={{ fontWeight: 600 }}>Reason (optional)</label>
                        <input
                            type="text"
                            value={reassignReason}
                            onChange={(e) => setReassignReason(e.target.value)}
                            placeholder="e.g., Sent to wrong pool"
                            style={{ padding: '0.6rem', borderRadius: '4px', border: '1px solid #ddd' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                            <button type="button" onClick={() => setIsReassignOpen(false)} style={{ padding: '0.6rem 1rem', border: '1px solid #aaa', background: 'transparent', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                            <button type="submit" style={{ padding: '0.6rem 1rem', border: 'none', background: '#0A2540', color: 'white', borderRadius: '4px', cursor: 'pointer' }}>Reassign</button>
                        </div>
                    </form>
                </Modal>
            )}
        </>
    );
};

export default TrkbitPage;
