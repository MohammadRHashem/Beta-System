import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { getInvoices, getRecipientNames, exportInvoices } from '../services/api';
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
        search: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
        sourceGroups: [],
        recipientNames: [],
        reviewStatus: '',
        status: '',
    });

    const [sort, setSort] = useState({ sortBy: 'received_at', sortOrder: 'desc' });
    const { isAuthenticated } = useAuth();
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);
    const [insertAtIndex, setInsertAtIndex] = useState(null);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const params = {
                ...filters,
                ...sort,
                page: pagination.page,
                limit: pagination.limit,
            };
            Object.keys(params).forEach(key => (!params[key] || params[key].length === 0) && delete params[key]);

            const { data } = await getInvoices(params);
            setInvoices(data.invoices);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords }));
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
        } finally {
            setLoading(false);
        }
    }, [filters, sort, pagination.page, pagination.limit]);

    useEffect(() => {
        if (isAuthenticated) {
            fetchInvoices();
        }
    }, [fetchInvoices, isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            const fetchFilterData = async () => {
                const { data: recipients } = await getRecipientNames();
                setRecipientNames(recipients);
            };
            fetchFilterData();
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated && socket) {
            const handleInvoiceUpdate = () => {
                console.log('Received invoices:updated event, refetching...');
                fetchInvoices();
            };
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => {
                socket.off('invoices:updated', handleInvoiceUpdate);
            };
        }
    }, [isAuthenticated, socket, fetchInvoices]);

    const handleFilterChange = (newFilters) => {
        setPagination(prev => ({ ...prev, page: 1 }));
        setFilters(newFilters);
    };
    
    const handleSortChange = (newSort) => {
        setSort(newSort);
    };

    const handleExport = async () => {
        const params = { ...filters, ...sort };
        Object.keys(params).forEach(key => (!params[key] || params[key].length === 0) && delete params[key]);
        try {
            await exportInvoices(params);
        } catch (error) {
            console.error("Failed to export invoices:", error);
            alert("Failed to export invoices.");
        }
    };
    
    const openModal = (invoice = null, index = null) => {
        setEditingInvoice(invoice);
        setInsertAtIndex(index);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setEditingInvoice(null);
        setInsertAtIndex(null);
        setIsModalOpen(false);
    };

    const onSave = () => {
        closeModal();
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
                invoices={invoices}
                insertAtIndex={insertAtIndex}
                onSave={onSave}
            />
        </>
    );
};

export default InvoicesPage;