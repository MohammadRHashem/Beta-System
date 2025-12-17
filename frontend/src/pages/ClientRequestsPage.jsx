import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getClientRequests, completeClientRequest, updateClientRequestAmount } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { FaClipboardList, FaCheck, FaDollarSign, FaEdit } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; `;
const Card = styled.div` background: #fff; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); `;
const Title = styled.h2` display: flex; align-items: center; gap: 0.75rem; margin: 0; color: ${({ theme }) => theme.primary}; `;
const Table = styled.table` width: 100%; border-collapse: collapse; margin-top: 1.5rem; th, td { padding: 1rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; } th { background-color: ${({ theme }) => theme.background}; } `;
const Button = styled.button` background-color: #e3fcef; color: #006644; border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; &:hover { background-color: #d1f7e2; } `;
const ContentCell = styled.td` font-family: 'Courier New', Courier, monospace; font-weight: 500; word-break: break-all; `;
const AmountButton = styled.button` background: transparent; border: 1px dashed #ccc; color: #666; cursor: pointer; padding: 0.3rem 0.8rem; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem; &:hover { background: #f0f0f0; border-color: #999; } `;
const AmountDisplay = styled.div` font-weight: bold; color: ${({ theme }) => theme.primary}; display: flex; align-items: center; gap: 0.5rem; svg { cursor: pointer; color: #999; &:hover { color: #333; } } `;

const SAO_PAULO_TIMEZONE = 'America/Sao_Paulo';

const ClientRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
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
                            <th>Received At (BRT)</th>
                            <th>Group Name</th>
                            <th>Request Type</th>
                            <th>Content</th>
                            <th>Amount</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="6">Loading...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="6" style={{ textAlign: 'center', padding: '2rem' }}>All caught up! No pending requests.</td></tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req.id}>
                                    <td>{formatInTimeZone(new Date(req.received_at), SAO_PAULO_TIMEZONE, 'dd/MM/yyyy HH:mm:ss')}</td>
                                    <td>{req.source_group_name}</td>
                                    <td>{req.request_type}</td>
                                    <ContentCell>{req.content}</ContentCell>
                                    <td>
                                        {req.amount ? (
                                            <AmountDisplay>
                                                ${parseFloat(req.amount).toFixed(2)}
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
                                </tr>
                            ))
                        )}
                    </tbody>
                </Table>
            </Card>
        </PageContainer>
    );
};

export default ClientRequestsPage;