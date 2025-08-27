import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import api, { getInvoices, getRecipientNames, getExportUrl } from '../services/api';
import { FaPlus, FaFileExcel } from 'react-icons/fa';
import InvoiceFilter from '../components/InvoiceFilter';
import InvoiceTable from '../components/InvoiceTable';
import InvoiceModal from '../components/InvoiceModal';

const PageContainer = styled.div`
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
`;

const Header = styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
`;

const Title = styled.h2`
    margin: 0;
`;

const Actions = styled.div`
    display: flex;
    gap: 1rem;
`;

const Button = styled.button`
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem 1.2rem;
    border: none;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
    background-color: ${({ theme, primary }) => primary ? theme.secondary : theme.primary};
    color: white;
    font-size: 0.9rem;
    
    &:hover {
        opacity: 0.9;
    }
`;

const InvoicesPage = ({ allGroups, socket }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recipientNames, setRecipientNames] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1 });
    
    const [filters, setFilters] = useState({
        search: '',
        dateFrom: '',
        dateTo: '',
        sourceGroup: '',
        recipientName: '',
        reviewStatus: '',
    });

    const [sort, setSort] = useState({ sortBy: 'received_at', sortOrder: 'desc' });
    const { isAuthenticated } = useAuth();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...filters,
                ...sort,
                page: pagination.page,
                limit: pagination.limit,
            };
            // Remove empty filters
            Object.keys(params).forEach(key => !params[key] && delete params[key]);

            const { data } = await getInvoices(params);
            setInvoices(data.invoices);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords }));
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
        } finally {
            setLoading(false);
        }
    }, [filters, sort, pagination.page, pagination.limit]);

    // Initial data fetch and WebSocket listener setup
    useEffect(() => {
        if (isAuthenticated) {
            fetchInvoices();
            
            const fetchFilterData = async () => {
                const { data: recipients } = await getRecipientNames();
                setRecipientNames(recipients);
            };
            fetchFilterData();

            const handleInvoiceUpdate = () => {
                console.log('Received invoices:updated event, refetching...');
                fetchInvoices();
            };
            
            socket?.on('invoices:updated', handleInvoiceUpdate);

            return () => {
                socket?.off('invoices:updated', handleInvoiceUpdate);
            };
        }
    }, [isAuthenticated, fetchInvoices, socket]);

    const handleFilterChange = (newFilters) => {
        setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on filter change
        setFilters(newFilters);
    };
    
    const handleSortChange = (newSort) => {
        setSort(newSort);
    };

    const handleExport = () => {
        const params = { ...filters, ...sort };
        Object.keys(params).forEach(key => !params[key] && delete params[key]);
        const url = getExportUrl(params);
        window.open(url, '_blank');
    };
    
    const openModal = (invoice = null) => {
        setEditingInvoice(invoice);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setEditingInvoice(null);
        setIsModalOpen(false);
    };

    const onSave = () => {
        closeModal();
        // The websocket event will trigger a refetch
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Invoices</Title>
                    <Actions>
                        <Button onClick={handleExport}><FaFileExcel /> Export</Button>
                        <Button primary onClick={() => openModal()}><FaPlus /> Add Entry</Button>
                    </Actions>
                </Header>

                <InvoiceFilter
                    filters={filters}
                    onFilterChange={handleFilterChange}
                    allGroups={allGroups}
                    recipientNames={recipientNames}
                />

                <InvoiceTable
                    invoices={invoices}
                    loading={loading}
                    sort={sort}
                    onSortChange={handleSortChange}
                    onEdit={openModal}
                    pagination={pagination}
                    setPagination={setPagination}
                />
            </PageContainer>
            
            <InvoiceModal
                isOpen={isModalOpen}
                onClose={closeModal}
                invoice={editingInvoice}
                onSave={onSave}
            />
        </>
    );
};

export default InvoicesPage;