import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getAuditLogs, getAllUsers } from '../services/api';
import Pagination from '../components/Pagination';
import Modal from '../components/Modal';
import { FaHistory, FaInfoCircle } from 'react-icons/fa';
import { format } from 'date-fns';

// Styled Components
const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const Title = styled.h2`
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    color: ${({ theme }) => theme.primary};
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const FilterContainer = styled.div`
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 1.5rem;
    align-items: flex-end;
    margin-bottom: 1.5rem;
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 500;
    font-size: 0.9rem;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
`;

const Select = styled.select`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    background-color: white;
`;

const ClearButton = styled.button`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.lightText};
    color: ${({ theme }) => theme.lightText};
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    
    &:hover {
        background: ${({ theme }) => theme.background};
    }
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
        vertical-align: middle;
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
`;

const DetailsButton = styled.button`
    background: none;
    border: none;
    color: ${({ theme }) => theme.primary};
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
`;

const DetailsJson = styled.pre`
    background: #f6f9fc;
    border: 1px solid ${({ theme }) => theme.border};
    padding: 1rem;
    border-radius: 4px;
    white-space: pre-wrap;
    word-break: break-all;
    font-size: 0.85rem;
    max-height: 400px;
    overflow-y: auto;
`;


// --- Component Logic ---
const AuditLogPage = () => {
    const [logs, setLogs] = useState([]);
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ userId: '', action: '', dateFrom: '', dateTo: '' });
    const [pagination, setPagination] = useState({ page: 1, limit: 25, totalPages: 1 });
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [selectedLogDetails, setSelectedLogDetails] = useState(null);

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filters, page: pagination.page, limit: pagination.limit };
            const { data } = await getAuditLogs(params);
            setLogs(data.logs);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, currentPage: data.currentPage }));
        } catch (error) {
            alert('Failed to fetch audit logs.');
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.page, pagination.limit]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    useEffect(() => {
        // Fetch the list of users for the filter dropdown
        getAllUsers().then(res => setUsers(res.data)).catch(() => console.error("Could not fetch users for filter."));
    }, []);

    const handleFilterChange = (e) => {
        setFilters(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleClearFilters = () => {
        setFilters({ userId: '', action: '', dateFrom: '', dateTo: '' });
        setPagination(prev => ({ ...prev, page: 1 }));
    };

    const handleViewDetails = (details) => {
        setSelectedLogDetails(details);
        setIsDetailsModalOpen(true);
    };

    const formatTimestamp = (ts) => {
        if (!ts) return 'N/A';
        return format(new Date(ts), 'dd/MM/yyyy HH:mm:ss');
    };

    return (
        <>
            <PageContainer>
                <Title><FaHistory /> Audit Log</Title>
                <Card>
                    <FilterContainer>
                        <InputGroup>
                            <Label>User</Label>
                            <Select name="userId" value={filters.userId} onChange={handleFilterChange}>
                                <option value="">All Users</option>
                                {users.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
                            </Select>
                        </InputGroup>
                        <InputGroup>
                            <Label>Action Contains</Label>
                            <Input name="action" value={filters.action} onChange={handleFilterChange} placeholder="e.g., invoice:delete" />
                        </InputGroup>
                        <InputGroup>
                            <Label>From Date</Label>
                            <Input name="dateFrom" type="date" value={filters.dateFrom} onChange={handleFilterChange} />
                        </InputGroup>
                        <InputGroup>
                            <Label>To Date</Label>
                            <Input name="dateTo" type="date" value={filters.dateTo} onChange={handleFilterChange} />
                        </InputGroup>
                        <ClearButton onClick={handleClearFilters}>Clear Filters</ClearButton>
                    </FilterContainer>

                    <Table>
                        <thead>
                            <tr>
                                <th>Timestamp</th>
                                <th>User</th>
                                <th>Action</th>
                                <th>Target</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr><td colSpan="5">Loading logs...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="5" style={{ textAlign: 'center', padding: '2rem' }}>No logs found for the selected criteria.</td></tr>
                            ) : (
                                logs.map(log => (
                                    <tr key={log.id}>
                                        <td>{formatTimestamp(log.timestamp)}</td>
                                        <td>{log.username}</td>
                                        <td>{log.action}</td>
                                        <td>{log.target_type && `${log.target_type} #${log.target_id}`}</td>
                                        <td>
                                            {log.details && (
                                                <DetailsButton onClick={() => handleViewDetails(log.details)} title="View Details">
                                                    <FaInfoCircle />
                                                </DetailsButton>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </Table>
                    <Pagination pagination={pagination} setPagination={setPagination} />
                </Card>
            </PageContainer>
            
            <Modal isOpen={isDetailsModalOpen} onClose={() => setIsDetailsModalOpen(false)} maxWidth="700px">
                <h2>Log Details</h2>
                {selectedLogDetails && (
                    <DetailsJson>
                        {JSON.stringify(JSON.parse(selectedLogDetails), null, 2)}
                    </DetailsJson>
                )}
            </Modal>
        </>
    );
};

export default AuditLogPage;