import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { getInvoices, getRecipientNames, exportInvoices } from '../services/api';
import { FaPlus, FaFileExcel, FaSyncAlt } from 'react-icons/fa';
import InvoiceFilter from '../components/InvoiceFilter';
import InvoiceTable from '../components/InvoiceTable';
import InvoiceModal from '../components/InvoiceModal';
import { useSocket } from '../context/SocketContext';

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const PageContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  height: 100%;
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
  background-color: ${({ theme, primary }) =>
    primary ? theme.secondary : theme.primary};
  color: white;
  font-size: 0.9rem;
  &:hover {
    opacity: 0.9;
  }
  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;
const RefreshBanner = styled.div`
  background-color: ${({ theme }) => theme.secondary};
  color: white;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  text-align: center;
  font-weight: 600;
  cursor: pointer;
  margin-bottom: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
`;

const InvoicesPage = ({ allGroups }) => {
    const socket = useSocket();
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [recipientNames, setRecipientNames] = useState([]);
    const [hasNewInvoices, setHasNewInvoices] = useState(false);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    
    const [filters, setFilters] = useState({
        search: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
        sourceGroups: [], recipientNames: [],
        reviewStatus: '', status: '',
    });
    
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

    const debouncedSearch = useDebounce(filters.search, 500);
    const isInitialMount = useRef(true);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setHasNewInvoices(false);
        try {
            const params = { 
                ...filters,
                search: debouncedSearch,
                page: pagination.page, 
                limit: pagination.limit 
            };
            Object.keys(params).forEach(key => (!params[key] || (Array.isArray(params[key]) && params[key].length === 0)) && delete params[key]);
            const { data } = await getInvoices(params);
            setInvoices(data.invoices || []);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords, currentPage: data.currentPage }));
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, debouncedSearch]); // This function depends on all filters and pagination

    // Effect 1: Fetch recipient names on initial load
    useEffect(() => {
        getRecipientNames().then(response => setRecipientNames(response.data || [])).catch(err => console.error(err));
    }, []);

    // Effect 2: The SINGLE source of truth for fetching data.
    // It runs whenever the page, or any filter, changes.
    useEffect(() => {
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return; // Don't run on the very first render
        }
        
        // This effect's only job is to reset the page if it's not already 1
        if (pagination.page !== 1) {
            setPagination(p => ({ ...p, page: 1 }));
        }
        
    }, [debouncedSearch, filters.dateFrom, filters.dateTo, filters.timeFrom, filters.timeTo, filters.sourceGroups, filters.recipientNames, filters.reviewStatus, filters.status]); // Note: pagination.page is NOT a dependency here

    // Effect 3: This effect ONLY handles fetching for page changes.
    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);
    
    useEffect(() => {
        if (socket) {
            const handleInvoiceUpdate = () => setHasNewInvoices(true);
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => socket.off('invoices:updated', handleInvoiceUpdate);
        }
    }, [socket]);

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportInvoices({ ...filters, search: debouncedSearch });
        } catch (error) {
            console.error("Failed to export invoices:", error);
            alert("Failed to export invoices.");
        } finally {
            setIsExporting(false);
        }
    };
    
    const openEditModal = (invoice) => {
        setEditingInvoice(invoice);
        setIsInvoiceModalOpen(true);
    };

    const handleSave = () => { 
        closeAllModals(); 
        fetchInvoices(pagination.page, filters, debouncedSearch);
    };
    const closeAllModals = () => { setIsInvoiceModalOpen(false); setEditingInvoice(null); };

    return (
        <>
            <PageContainer>
                <Header>
                    <Title>Invoices</Title>
                    <Actions>
                        <Button onClick={handleExport} disabled={isExporting}>
                            <FaFileExcel /> {isExporting ? 'Exporting...' : 'Export'}
                        </Button>
                        <Button primary="true" onClick={() => openEditModal(null)}><FaPlus /> Add Entry</Button>
                    </Actions>
                </Header>
                
                {hasNewInvoices && (
                    <RefreshBanner onClick={() => fetchInvoices(pagination.page, filters, debouncedSearch)}>
                        <FaSyncAlt /> New invoices have arrived. Click to refresh the list.
                    </RefreshBanner>
                )}

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
                    pagination={pagination}
                    setPagination={setPagination}
                />
            </PageContainer>
            
            <InvoiceModal
                isOpen={isInvoiceModalOpen}
                onClose={closeAllModals}
                onSave={handleSave}
                invoice={editingInvoice}
            />
        </>
    );
};

export default InvoicesPage;