import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styled from 'styled-components';
import { getClientRequests, completeClientRequest, updateClientRequestAmount, updateClientRequestContent, getRequestTypes, updateRequestTypeOrder, restoreClientRequest } from '../services/api';
import { useSocket } from '../context/SocketContext';
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK
import { FaClipboardList, FaCheck, FaDollarSign, FaEdit, FaSort, FaSortUp, FaSortDown, FaHistory, FaCog, FaArrowUp, FaArrowDown } from 'react-icons/fa';
import { formatInTimeZone } from 'date-fns-tz';
import Modal from '../components/Modal';

// --- STYLED COMPONENTS ---
const PageContainer = styled.div` display: flex; flex-direction: column; gap: 1.5rem; `;
const Header = styled.div` display: flex; justify-content: space-between; align-items: center; `;
const Card = styled.div` background: #fff; padding: 1.5rem 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); `;
const Title = styled.h2` display: flex; align-items: center; gap: 0.75rem; margin: 0; color: ${({ theme }) => theme.primary}; `;
const Table = styled.table` width: 100%; border-collapse: collapse; margin-top: 1.5rem; th, td { padding: 1rem; text-align: left; border-bottom: 1px solid ${({ theme }) => theme.border}; vertical-align: middle; } `;
const TableHeader = styled.th` background-color: ${({ theme }) => theme.background}; cursor: pointer; user-select: none; &:hover { background-color: #eef2f7; } `;
const TableRow = styled.tr` border-left: 5px solid ${props => props.highlightColor || '#E0E0E0'}; transition: background-color 0.2s; &:hover { background-color: ${props => props.highlightColor ? `${props.highlightColor}4D` : '#f9f9f9'}; } `;
const Button = styled.button` border: none; padding: 0.5rem 1rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 0.5rem; &.complete { background-color: #e3fcef; color: #006644; &:hover { background-color: #d1f7e2; } } &.restore { background-color: #e3f2fd; color: #0d47a1; &:hover { background-color: #bbdefb; } }`;
const EditableCell = styled.div` display: flex; align-items: center; gap: 0.75rem; font-weight: bold; color: ${({ theme }) => theme.primary}; svg { cursor: pointer; color: #999; flex-shrink: 0; &:hover { color: #333; } }`;
const ContentCell = styled.td` font-family: 'Courier New', Courier, monospace; font-weight: 500; word-break: break-all; ${EditableCell} > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px; }`;
const AmountButton = styled.button` background: transparent; border: 1px dashed #ccc; color: #666; cursor: pointer; padding: 0.3rem 0.8rem; border-radius: 4px; display: flex; align-items: center; gap: 0.5rem; &:hover { background: #f0f0f0; border-color: #999; } `;
const TabContainer = styled.div` border-bottom: 2px solid ${({ theme }) => theme.border}; margin-bottom: 1.5rem; display: flex; flex-wrap: wrap; `;
const Tab = styled.button` padding: 0.75rem 1.25rem; border: none; background: transparent; cursor: pointer; font-weight: 600; font-size: 1rem; color: ${({ theme, active }) => active ? theme.primary : theme.lightText}; border-bottom: 3px solid ${({ theme, active }) => active ? theme.secondary : 'transparent'}; margin-bottom: -2px; transition: all 0.2s ease-in-out; `;
const ConfigButton = styled.button` background: transparent; border: none; color: ${({ theme }) => theme.lightText}; cursor: pointer; font-size: 1.2rem; &:hover { color: ${({ theme }) => theme.primary}; } `;
const ModalList = styled.ul` list-style: none; margin: 1rem 0; padding: 0; `;
const ModalListItem = styled.li` display: flex; justify-content: space-between; align-items: center; padding: 0.75rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 4px; margin-bottom: 0.5rem; background: #f9f9f9; `;
const ArrowButton = styled.button` background: transparent; border: none; font-size: 1.2rem; cursor: pointer; color: ${({ theme }) => theme.text}; &:disabled { color: #ccc; cursor: not-allowed; } `;
const SaveOrderButton = styled.button` background-color: ${({ theme }) => theme.primary}; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 4px; cursor: pointer; font-weight: bold; display: block; margin-left: auto; `;
const SearchRow = styled.div` display: flex; justify-content: flex-end; align-items: center; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; `;
const SearchInput = styled.input` padding: 0.65rem 0.9rem; border: 1px solid ${({ theme }) => theme.border}; border-radius: 6px; font-size: 0.95rem; min-width: 260px; `;

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
    const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
    const canEditSettings = hasPermission('settings:edit_request_triggers'); // 3. DEFINE EDIT CAPABILITY
    const canComplete = hasPermission('client_requests:complete');
    const canEditAmount = hasPermission('client_requests:edit_amount');
    const canEditContent = hasPermission('client_requests:edit_content');
    const canRestore = hasPermission('client_requests:restore');

    const [allRequests, setAllRequests] = useState([]);
    const [requestTypes, setRequestTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [sortConfig, setSortConfig] = useState({ key: 'received_at', direction: 'asc' });
    const [activeView, setActiveView] = useState('pending');
    const [activeTypeTab, setActiveTypeTab] = useState('All');
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const socket = useSocket();

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [requestsRes, typesRes] = await Promise.all([getClientRequests(), getRequestTypes()]);
            setAllRequests(requestsRes.data);
            setRequestTypes(typesRes.data);
        } catch (error) {
            alert("Could not load page data.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);
    
    useEffect(() => {
        if (socket) {
            socket.on('client_request:update', fetchData);
            return () => { socket.off('client_request:update', fetchData); };
        }
    }, [socket, fetchData]);
    
    const filteredAndSortedRequests = useMemo(() => {
        let items = allRequests.filter(req => activeView === 'completed' ? req.is_completed : !req.is_completed);
        if (activeTypeTab !== 'All') {
            items = items.filter(req => req.request_type === activeTypeTab);
        }
        if (searchTerm.trim()) {
            const query = searchTerm.trim().toLowerCase();
            items = items.filter(req => {
                const values = [
                    req.source_group_name,
                    req.request_type,
                    req.content,
                    req.amount,
                    req.completed_by,
                    req.received_at,
                    req.completed_at
                ];
                return values.some(val => (val || '').toString().toLowerCase().includes(query));
            });
        }
        if (sortConfig.key) {
            items.sort((a, b) => {
                const aValue = a[sortConfig.key]; const bValue = b[sortConfig.key];
                let comparison = 0;
                if (sortConfig.key === 'amount') comparison = (parseFloat(aValue) || 0) - (parseFloat(bValue) || 0);
                else if (sortConfig.key === 'received_at' || sortConfig.key === 'completed_at') comparison = new Date(aValue) - new Date(bValue);
                else comparison = (aValue || '').toString().localeCompare((bValue || '').toString());
                return sortConfig.direction === 'asc' ? comparison : -comparison;
            });
        }
        return items;
    }, [allRequests, activeView, activeTypeTab, sortConfig, searchTerm]);

    const columnCount = activeView === 'completed' ? 7 : 6;

    const handleOnDragEnd = async (result) => {
        if (!result.destination) return;
        const items = Array.from(requestTypes);
        const [reorderedItem] = items.splice(result.source.index, 1);
        items.splice(result.destination.index, 0, reorderedItem);
        
        setRequestTypes(items);
        
        const orderedIds = items.map(item => item.id);
        try {
            await updateRequestTypeOrder(orderedIds);
        } catch (error) {
            alert("Failed to save new tab order. Reverting.");
            fetchData();
        }
    };

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

    useEffect(() => {
        setSearchTerm('');
    }, [activeView, activeTypeTab]);

    const handleComplete = async (id) => {
        if (!canComplete) return;
        try { await completeClientRequest(id); } 
        catch (error) { alert('Failed to mark as complete.'); }
    };
    
    // --- NEW: Restore Handler ---
    const handleRestore = async (id) => {
        if (!canRestore) return;
        if (window.confirm("Are you sure you want to restore this request? It will reappear in the pending queue.")) {
            try { await restoreClientRequest(id); } 
            catch (error) { alert('Failed to restore request.'); }
        }
    };

    const handleAmountUpdate = async (id) => {
        if (!canEditAmount) return;
        const currentAmount = allRequests.find(r => r.id === id)?.amount || '';
        const newAmount = prompt("Enter the amount for this request:", formatAmount(currentAmount));

        if (newAmount !== null && newAmount.trim() !== "" && !isNaN(newAmount.replace(/,/g, ''))) {
            try {
                await updateClientRequestAmount(id, parseFloat(newAmount.replace(/,/g, '')));
            } catch (error) {
                alert('Failed to update amount.');
            }
        } else if (newAmount !== null) {
            alert("Please enter a valid number.");
        }
    };

    const handleContentUpdate = async (id) => {
        if (!canEditContent) return;
        const currentContent = allRequests.find(r => r.id === id)?.content || '';
        const newContent = prompt("Enter the new information:", currentContent);

        if (newContent !== null) {
            try {
                await updateClientRequestContent(id, newContent);
            } catch (error) {
                alert('Failed to update information.');
            }
        }
    };

    const handleMoveTab = (index, direction) => {
        const items = Array.from(requestTypes);
        const [movedItem] = items.splice(index, 1);
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        items.splice(newIndex, 0, movedItem);
        setRequestTypes(items);
    };

    const handleSaveOrder = async () => {
        const orderedIds = requestTypes.map(item => item.id);
        try {
            await updateRequestTypeOrder(orderedIds);
            setIsConfigModalOpen(false);
        } catch (error) {
            alert("Failed to save new tab order.");
        }
    };

    return (
        <>
            <PageContainer>
                <Header><Title><FaClipboardList /> Client Requests</Title></Header>
                <Card>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <TabContainer>
                            <Tab active={activeView === 'pending'} onClick={() => setActiveView('pending')}>Pending</Tab>
                            <Tab active={activeView === 'completed'} onClick={() => setActiveView('completed')}>Completed</Tab>
                        </TabContainer>
                        {/* 4. WRAP CONFIG BUTTON IN PERMISSION CHECK */}
                        {activeView === 'pending' && canEditSettings && (
                            <ConfigButton onClick={() => setIsConfigModalOpen(true)} title="Configure Tab Order">
                                <FaCog />
                            </ConfigButton>
                        )}
                    </div>

                    <TabContainer style={{ borderBottom: 'none' }}>
                        <Tab active={activeTypeTab === 'All'} onClick={() => setActiveTypeTab('All')}>
                            {activeView === 'pending' ? 'All Pending' : 'All Completed'}
                        </Tab>
                        {requestTypes.map(type => (
                            <Tab key={type.id} active={activeTypeTab === type.name} onClick={() => setActiveTypeTab(type.name)}>
                                {type.name}
                            </Tab>
                        ))}
                    </TabContainer>
                    <SearchRow>
                        <SearchInput
                            placeholder={`Search ${activeView === 'completed' ? 'completed' : 'pending'}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </SearchRow>
                    
                    <Table>
                    <thead>
                        <tr>
                            <TableHeader onClick={() => handleSort('received_at')}>
                                {activeView === 'completed' ? 'Date' : 'Received At (BRT)'} {getSortIcon('received_at')}
                            </TableHeader>
                            <TableHeader onClick={() => handleSort('source_group_name')}>Group Name {getSortIcon('source_group_name')}</TableHeader>
                            <TableHeader onClick={() => handleSort('request_type')}>Request Type {getSortIcon('request_type')}</TableHeader>
                            <TableHeader onClick={() => handleSort('content')}>Information {getSortIcon('content')}</TableHeader>
                            <TableHeader onClick={() => handleSort('amount')}>Amount {getSortIcon('amount')}</TableHeader>
                            {activeView === 'completed' && <TableHeader>Completed At</TableHeader>}
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                            {loading ? (
                                <tr><td colSpan="7">Loading...</td></tr>
                            ) : filteredAndSortedRequests.length === 0 ? (
                                <tr><td colSpan={columnCount} style={{ textAlign: 'center', padding: '2rem' }}>No requests found for this view.</td></tr>
                            ) : (
                                filteredAndSortedRequests.map(req => (
                                    <TableRow key={req.id} highlightColor={req.type_color}>
                                        <td>{formatSaoPauloDateTime(req.received_at, 'dd/MM/yyyy HH:mm')}</td>
                                        <td>{req.source_group_name}</td>
                                        <td>{req.request_type}</td>
                                        <ContentCell>
                                            <EditableCell>
                                                <span title={req.content}>{req.content}</span>
                                                {canEditContent && <FaEdit onClick={() => handleContentUpdate(req.id)} />}
                                            </EditableCell>
                                        </ContentCell>
                                        <td>
                                            {req.amount ? (
                                                <EditableCell>
                                                    {formatAmount(req.amount)}
                                                    {canEditAmount && <FaEdit onClick={() => handleAmountUpdate(req.id)} />}
                                                </EditableCell>
                                            ) : (
                                                activeView === 'pending' && canEditAmount && <AmountButton onClick={() => handleAmountUpdate(req.id)}><FaDollarSign /> Add</AmountButton>
                                            )}
                                        </td>
                                        {activeView === 'completed' && (
                                            <td>
                                                {formatSaoPauloDateTime(req.completed_at, 'dd/MM HH:mm')}
                                                <br />
                                                <small>by {req.completed_by || 'N/A'}</small>
                                            </td>
                                        )}
                                        <td>
                                            {activeView === 'pending' ? (
                                                canComplete ? (
                                                    <Button className="complete" onClick={() => handleComplete(req.id)}>
                                                        <FaCheck /> Mark as Done
                                                    </Button>
                                                ) : (
                                                    <span>-</span>
                                                )
                                            ) : (
                                                canRestore ? (
                                                    <Button className="restore" onClick={() => handleRestore(req.id)}>
                                                        <FaHistory /> Restore
                                                    </Button>
                                                ) : (
                                                    <span>-</span>
                                                )
                                            )}
                                        </td>
                                    </TableRow>
                                ))
                            )}
                        </tbody>
                    </Table>
                </Card>
            </PageContainer>
            
            {/* Modal is implicitly protected as it's only opened by users who can see the ConfigButton */}
            <Modal isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)}>
                <h2>Arrange Tab Order</h2>
                <p>Click the arrows to reorder how the request type tabs appear.</p>
                <ModalList>
                    {requestTypes.map((type, index) => (
                        <ModalListItem key={type.id}>
                            <span>{type.name}</span>
                            <div style={{ display: 'flex', gap: '1rem' }}>
                                <ArrowButton onClick={() => handleMoveTab(index, 'up')} disabled={index === 0}>
                                    <FaArrowUp />
                                </ArrowButton>
                                <ArrowButton onClick={() => handleMoveTab(index, 'down')} disabled={index === requestTypes.length - 1}>
                                    <FaArrowDown />
                                </ArrowButton>
                            </div>
                        </ModalListItem>
                    ))}
                </ModalList>
                <SaveOrderButton onClick={handleSaveOrder}>Save Order</SaveOrderButton>
            </Modal>
        </>
    );
};

export default ClientRequestsPage;
