import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getTrkbitTransactions, exportTrkbit } from '../services/api';
import { FaFileExcel, FaSearch, FaLink, FaUnlink } from 'react-icons/fa';
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

const ActionLink = styled(FaLink)`
    cursor: pointer;
    color: ${({ theme }) => theme.primary};
    &:hover {
        color: ${({ theme }) => theme.secondary};
    }
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
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);

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

    const handleExport = () => {
        exportTrkbit(filters);
    };

    const formatAdjustedDate = (dateString) => {
        if (!dateString) return 'N/A';
        const date = new Date(dateString);
        // Subtract 3 hours
        date.setHours(date.getHours() - 3);
        
        // Format to readable string (Day/Month/Year Hour:Minute:Second)
        return new Intl.DateTimeFormat('pt-BR', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).format(date);
    };

    const openLinkModal = (tx) => {
        setSelectedTransaction({ id: tx.uid, amount: tx.amount, source: 'Trkbit' });
        setIsLinkModalOpen(true);
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Trkbit Transactions</Title>
                    <Button onClick={handleExport}><FaFileExcel /> Export Excel</Button>
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
                                <th>Link Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? <tr><td colSpan="5">Loading...</td></tr> : transactions.map(tx => (
                                <tr key={tx.id}>
                                    <td>{formatAdjustedDate(tx.tx_date)}</td>
                                    <td>{tx.tx_payer_name}</td>
                                    <td>{/* ... */}</td>
                                    <td>{tx.tx_id}</td>
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
                                </tr>
                            ))}
                        </tbody>
                    </Table>
                </TableWrapper>
                <Pagination pagination={pagination} setPagination={setPagination} />
            </PageContainer>
            <LinkInvoiceModal 
                isOpen={isLinkModalOpen}
                onClose={() => { setIsLinkModalOpen(false); fetchData(); }}
                transaction={selectedTransaction}
            />
        </>
    );
};

export default TrkbitPage;