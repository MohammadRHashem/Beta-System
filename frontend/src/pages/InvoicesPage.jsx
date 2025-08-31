import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { getInvoices, getRecipientNames, exportInvoices } from '../services/api';
import { FaPlus, FaFileExcel } from 'react-icons/fa';
import InvoiceFilter from '../components/InvoiceFilter';
import InvoiceTable from '../components/InvoiceTable';
import InvoiceModal from '../components/InvoiceModal';
import InsertTransactionModal from '../components/InsertTransactionModal'; // The new, simpler modal


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

    // We no longer need client-side sorting state, the backend handles it.
    const { isAuthenticated } = useAuth();
    
    // State for the main Edit/Add modal
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

    // State for the NEW "Insert Between" modal
    const [isInsertModalOpen, setIsInsertModalOpen] = useState(false);
    const [insertAfterId, setInsertAfterId] = useState(null);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const params = { ...filters, page: pagination.page, limit: pagination.limit };
            Object.keys(params).forEach(key => (!params[key] || params[key].length === 0) && delete params[key]);
            const { data } = await getInvoices(params);
            setInvoices(data.invoices);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords }));
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
        } finally {
            setLoading(false);
        }
    }, [filters, pagination.page, pagination.limit]);

    useEffect(() => {
        if (isAuthenticated) { fetchInvoices(); }
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
        setPagination(p => ({ ...p, page: 1 }));
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
    
    const openEditModal = (invoice) => {
        setEditingInvoice(invoice);
        setIsInvoiceModalOpen(true);
    };

    const openInsertModal = (index) => {
        // If index is 0, we want to insert before the first item.
        // Otherwise, we insert after the item at index - 1.
        const prevInvoiceId = index === 0 ? 'START' : invoices[index - 1]?.id;
        if (prevInvoiceId) {
            setInsertAfterId(prevInvoiceId);
            setIsInsertModalOpen(true);
        }
    };

    const closeAllModals = () => {
        setIsInvoiceModalOpen(false);
        setEditingInvoice(null);
        setIsInsertModalOpen(false);
        setInsertAfterId(null);
    };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Invoices</Title>
                    <Actions>
                        <Button onClick={handleExport}><FaFileExcel /> Export</Button>
                        <Button primary onClick={() => openEditModal(null)}><FaPlus /> Add Entry</Button>
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
                    onEdit={openEditModal}
                    onInsert={openInsertModal}
                    pagination={pagination}
                    setPagination={setPagination}
                />
            </PageContainer>
            
            <InvoiceModal
                isOpen={isInvoiceModalOpen}
                onClose={closeAllModals}
                onSave={closeAllModals}
                invoice={editingInvoice}
            />

            <InsertTransactionModal
                isOpen={isInsertModalOpen}
                onClose={closeAllModals}
                onSave={closeAllModals}
                insertAfterId={insertAfterId}
            />
        </>
    );
};

export default InvoicesPage;