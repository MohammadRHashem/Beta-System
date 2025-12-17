import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { getClientRequests, completeClientRequest, updateClientRequestAmount } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { FaClipboardList, FaCheck, FaDollarSign, FaEdit, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; `;
const Card = styled.div` background: #fff; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); `;
const Title = styled.h2` display: flex; align-items: center; gap: 0.75rem; margin: 0; color: ${({ theme }) => theme.primary}; `;
const Table = styled.table` width: 100%; border-collapse: collapse; margin-top: 1.5rem; th, td { padding: 1rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; } `;
const TableHeader = styled.th`
    background-color: ${({ theme }) => theme.background};
    cursor: pointer;
    user-select: none;
    &:hover {
        background-color: #eef2f7;
    }
`;
const TableRow = styled.tr`
    border-left: 5px solid ${props => props.highlightColor || 'transparent'};
    transition: background-color 0.2s;
    &:hover {
        background-color: ${props => props.highlightColor ? `${props.highlightColor}20` : '#f9f9f9'};
    }
`;
const Button = styled.button` background-color: #e3fcef; color: #006644; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; &:hover { background-color: #d1f7e2; } `;
const ContentCell = styled.td` font-family: 'Courier New', Courier, monospace; font-weight: 500; word-break: break-all; `;
const AmountButton = styled.button` background: transparent; border: 1px dashed #ccc; color: #666; cursor: pointer; padding: 0.3rem 0.8rem; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem; &:hover { background: #f0f0f0; border-color: #999; } `;
const AmountDisplay = styled.div` font-weight: bold; color: ${({ theme }) => theme.primary}; display: flex; align-items: center; gap: 0.5rem; svg { cursor: pointer; color: #999; &:hover { color: #333; } } `;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const formatAmount = (value) => {
    const number = parseFloat(value);
    if (isNaN(number)) return '';
    return new Intl.NumberFormat('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(number);
};

const formatSaoPauloDateTime = (dbDateString, formatString) => {
    if (!dbDateString) return '';
    try {
        // Append 'Z' to tell JavaScript to parse the date as UTC
        const utcDate = new Date(dbDateString + 'Z');
        return formatInTimeZone(utcDate, SAO_PAULO_TIMEZONE, formatString);
    } catch (e) {
        console.warn("Could not format date:", dbDateString);
        return dbDateString; // Fallback
    }
};


const ClientRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'received_at', direction: 'asc' });
    const socket = useSocket();

    const fetchRequests = useCallback(async () => {
        try {
            const { data } = await getClientRequests();
            setRequests(data);
        } catch (error) {
            alert("Could not load requests.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRequests();
    }, [fetchRequests]);
    
    useEffect(() => {
        if (socket) {
            socket.on('client_request:new', fetchRequests);
            socket.on('client_request:update', fetchRequests);
            return () => {
                socket.off('client_request:new', fetchRequests);
                socket.off('client_request:update', fetchRequests);
            };
        }
    }, [socket, fetchRequests]);

    const sortedRequests = useMemo(() => {
        let sortableItems = [...requests];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];

                let comparison = 0;
                if (sortConfig.key === 'amount') {
                    comparison = (parseFloat(aValue) || 0) - (parseFloat(bValue) || 0);
                } else if (sortConfig.key === 'received_at') {
                    comparison = new Date(aValue) - new Date(bValue);
                } else {
                    comparison = (aValue || '').toString().localeCompare((bValue || '').toString());
                }
                
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }
        return sortableItems;
    }, [requests, sortConfig]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return <FaSort />;
        if (sortConfig.direction === 'asc') return <FaSortUp />;
        return <FaSortDown />;
    };

    const handleComplete = async (id) => {
        try {
            await completeClientRequest(id);
        } catch (error) {
            alert('Failed to mark as complete.');
        }
    };

    const handleAmountUpdate = async (id) => {
        const newAmount = prompt("Enter the amount for this request:", "");
        if (newAmount !== null && newAmount.trim() !== "" && !isNaN(newAmount)) {
            try {
                await updateClientRequestAmount(id, parseFloat(newAmount));
            } catch (error) {
                alert('Failed to update amount.');
            }
        } else if (newAmount !== null) {
            alert("Please enter a valid number.");
        }
    };

    return (
        <PageContainer>
            <Header>
                <Title><FaClipboardList /> Client Requests</Title>
            </Header>
            <Card>
                <p>These are special requests captured from clients based on custom triggers. Review them and mark as complete when handled.</p>
                <Table>
                    <thead>
                        <tr>
                            <TableHeader onClick={() => handleSort('received_at')}>Received At (BRT) {getSortIcon('received_at')}</TableHeader>
                            <TableHeader onClick={() => handleSort('source_group_name')}>Group Name {getSortIcon('source_group_name')}</TableHeader>
                            <TableHeader onClick={() => handleSort('request_type')}>Request Type {getSortIcon('request_type')}</TableHeader>
                            <TableHeader onClick={() => handleSort('content')}>Information {getSortIcon('content')}</TableHeader>
                            <TableHeader onClick={() => handleSort('amount')}>Amount {getSortIcon('amount')}</TableHeader>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6">Loading...</td></tr>
                        ) : sortedRequests.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>All caught up! No pending requests.</td></tr>
                        ) : (
                            sortedRequests.map(req => (
                                <TableRow key={req.id} highlightColor={req.type_color}>
                                    <td>{formatSaoPauloDateTime(req.received_at, 'dd/MM/yyyy HH:mm:ss')}</td>
                                    <td>{req.source_group_name}</td>
                                    <td>{req.request_type}</td>
                                    <ContentCell>{req.content}</ContentCell>
                                    <td>
                                        {req.amount ? (
                                            <AmountDisplay>
                                                {formatAmount(req.amount)}
                                                <FaEdit onClick={() => handleAmountUpdate(req.id)} />
                                            </AmountDisplay>
                                        ) : (
                                            <AmountButton onClick={() => handleAmountUpdate(req.id)}>
                                                <FaDollarSign /> Add
                                            </AmountButton>
                                        )}
                                    </td>
                                    <td>
                                        <Button onClick={() => handleComplete(req.id)}>
                                            <FaCheck /> Mark as Done
                                        </Button>
                                    </td>
                                </TableRow>
                            ))
                        )}
                    </tbody>
                </Table>
            </Card>
        </PageContainer>
    );
};

export default ClientRequestsPage;