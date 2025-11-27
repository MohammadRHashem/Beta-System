import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getTrkbitTransactions, exportTrkbit } from '../services/api';
import { FaFileExcel, FaSearch } from 'react-icons/fa';
import Pagination from '../components/Pagination';
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

const TrkbitPage = () => {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [filters, setFilters] = useState({ search: '', dateFrom: '', dateTo: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });

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

    return (
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
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? <tr><td colSpan="4">Loading...</td></tr> : transactions.map(tx => (
                            <tr key={tx.id}>
                                <td>{new Date(tx.tx_date).toLocaleString()}</td>
                                <td>{tx.tx_payer_name}</td>
                                <td style={{color: '#217346', fontWeight: 'bold'}}>
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(tx.amount)}
                                </td>
                                <td>{tx.tx_id}</td>
                            </tr>
                        ))}
                    </tbody>
                </Table>
            </TableWrapper>
            <Pagination pagination={pagination} setPagination={setPagination} />
        </PageContainer>
    );
};

export default TrkbitPage;