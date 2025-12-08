import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { getWalletRequests, completeWalletRequest } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { FaClipboardList, FaCheck } from 'react-icons/fa';
import { format } from 'date-fns';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 2rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
`;

const Card = styled.div`
    background: #fff;
    padding: 1.5rem 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
`;

const Title = styled.h2`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 0;
  color: ${({ theme }) => theme.primary};
`;

const Table = styled.table`
    width: 100%;
    border-collapse: collapse;
    margin-top: 1.5rem;
    th, td {
        padding: 1rem;
        text-align: left;
        border-bottom: 1px solid ${({ theme }) => theme.border};
    }
    th {
        background-color: ${({ theme }) => theme.background};
    }
`;

const Button = styled.button`
    background-color: #e3fcef;
    color: #006644;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    &:hover {
        background-color: #d1f7e2;
    }
`;

const WalletAddress = styled.td`
    font-family: 'Courier New', Courier, monospace;
    font-weight: 500;
    word-break: break-all;
`;

const WalletRequestsPage = () => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const socket = useSocket();

    const fetchRequests = useCallback(async () => {
        try {
            const { data } = await getWalletRequests();
            setRequests(data);
        } catch (error) {
            console.error("Failed to fetch wallet requests:", error);
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
            socket.on('wallet_request:new', fetchRequests);
            socket.on('wallet_request:update', fetchRequests);

            return () => {
                socket.off('wallet_request:new', fetchRequests);
                socket.off('wallet_request:update', fetchRequests);
            };
        }
    }, [socket, fetchRequests]);

    const handleComplete = async (id) => {
        try {
            await completeWalletRequest(id);
            // The socket event will trigger the UI update automatically
        } catch (error) {
            alert('Failed to mark as complete.');
        }
    };

    return (
        <PageContainer>
            <Header>
                <Title><FaClipboardList /> USDT Wallet Address Requests</Title>
            </Header>
            <Card>
                <p>These are USDT TRC-20 addresses sent by clients in chat. Review them and mark as complete when handled.</p>
                <Table>
                    <thead>
                        <tr>
                            <th>Received At</th>
                            <th>Group Name</th>
                            <th>Wallet Address</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan="4">Loading...</td></tr>
                        ) : requests.length === 0 ? (
                            <tr><td colSpan="4" style={{ textAlign: 'center', padding: '2rem' }}>All caught up! No pending requests.</td></tr>
                        ) : (
                            requests.map(req => (
                                <tr key={req.id}>
                                    <td>{format(new Date(req.received_at), 'dd/MM/yyyy HH:mm:ss')}</td>
                                    <td>{req.source_group_name}</td>
                                    <WalletAddress>{req.wallet_address}</WalletAddress>
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

export default WalletRequestsPage;