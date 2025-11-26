import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getSubCustomers } from '../services/api';
import ComboBox from '../components/ComboBox';
import Pagination from '../components/Pagination';
import { FaSearch, FaUserFriends } from 'react-icons/fa';
import { format } from 'date-fns';

// Helper Hook
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const FilterContainer = styled.div`
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 1.5rem;
    align-items: flex-end;

    @media (max-width: 768px) {
        grid-template-columns: 1fr;
    }
`;

const InputGroup = styled.div`
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
`;

const Label = styled.label`
    font-weight: 600;
    color: ${({ theme }) => theme.primary};
    display: flex;
    align-items: center;
    gap: 0.5rem;
`;

const Input = styled.input`
    padding: 0.75rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 4px;
    font-size: 1rem;
    width: 100%;
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
    
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
        font-weight: 600;
        color: ${({ theme }) => theme.primary};
    }
    tr:hover {
        background-color: #f9f9f9;
    }
`;

const SubCustomersPage = ({ allGroups }) => {
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchName, setSearchName] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [pagination, setPagination] = useState({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });

    const debouncedSearch = useDebounce(searchName, 500);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                page: pagination.page,
                limit: pagination.limit,
                searchName: debouncedSearch,
                groupId: selectedGroupId
            };
            const { data: response } = await getSubCustomers(params);
            setData(response.data);
            setPagination(prev => ({
                ...prev,
                totalPages: response.totalPages,
                totalRecords: response.totalRecords,
                currentPage: response.currentPage
            }));
        } catch (error) {
            console.error("Failed to fetch sub-customers:", error);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, debouncedSearch, selectedGroupId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Reset to page 1 when filters change
    useEffect(() => {
        setPagination(p => ({ ...p, page: 1 }));
    }, [debouncedSearch, selectedGroupId]);

    return (
        <PageContainer>
            <Card>
                <div style={{marginBottom: '1.5rem', borderBottom: '1px solid #eee', paddingBottom: '1rem'}}>
                    <h2 style={{display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0}}>
                        <FaUserFriends color="#00C49A"/> Potential Sub-Customers
                    </h2>
                    <p style={{color: '#666', marginTop: '0.5rem'}}>
                        Analyze sender names extracted from invoices to map relationships between end-payers and your WhatsApp clients.
                    </p>
                </div>

                <FilterContainer>
                    <InputGroup>
                        <Label><FaSearch /> Search Sub-Customer Name</Label>
                        <Input 
                            type="text" 
                            placeholder="e.g. Juan Perez..." 
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                        />
                    </InputGroup>
                    <InputGroup>
                        <Label>Filter by Main Customer (Group)</Label>
                        <ComboBox 
                            options={[{id: '', name: 'All Groups'}, ...allGroups]}
                            value={selectedGroupId}
                            onChange={(e) => setSelectedGroupId(e.target.value)}
                            placeholder="Select a client group..."
                        />
                    </InputGroup>
                </FilterContainer>

                {loading ? <p>Loading CRM data...</p> : (
                    <>
                        <Table>
                            <thead>
                                <tr>
                                    <th>Sub-Customer (Sender)</th>
                                    <th>Main Customer (WhatsApp Group)</th>
                                    <th>Tx Count</th>
                                    <th>Last Seen</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.length === 0 ? (
                                    <tr><td colSpan="4" style={{textAlign: 'center', padding: '2rem'}}>No records found matching your criteria.</td></tr>
                                ) : (
                                    data.map((row, index) => (
                                        <tr key={index}>
                                            <td style={{fontWeight: '500'}}>{row.sender_name}</td>
                                            <td style={{color: '#0A2540'}}>{row.group_name || 'Unknown Group'}</td>
                                            <td>{row.transaction_count}</td>
                                            <td style={{color: '#666'}}>
                                                {row.last_seen ? format(new Date(row.last_seen), 'dd/MM/yyyy HH:mm') : 'N/A'}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </Table>
                        <Pagination pagination={pagination} setPagination={setPagination} />
                    </>
                )}
            </Card>
        </PageContainer>
    );
};

export default SubCustomersPage;