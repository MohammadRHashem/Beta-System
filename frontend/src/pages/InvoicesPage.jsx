import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { getInvoices, getRecipientNames, exportInvoices } from '../services/api';
import { FaPlus, FaFileExcel, FaSyncAlt } from 'react-icons/fa';
import InvoiceFilter from '../components/InvoiceFilter';
import InvoiceTable from '../components/InvoiceTable';
import InvoiceModal from '../components/InvoiceModal';

// Debounce hook to prevent excessive API calls while typing
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
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
    background-color: ${({ theme, primary }) => primary ? theme.secondary : theme.primary};
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

const InvoicesPage = ({ allGroups, socket }) => {
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
    
    const { isAuthenticated } = useAuth();
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

    // Debounce the text search to avoid API calls on every keystroke
    const debouncedSearch = useDebounce(filters.search, 500);

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
            // Clean up empty params before sending
            Object.keys(params).forEach(key => (!params[key] || (Array.isArray(params[key]) && params[key].length === 0)) && delete params[key]);
            
            const { data } = await getInvoices(params);
            setInvoices(data.invoices || []);
            setPagination(prev => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords }));
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
            setInvoices([]);
        } finally {
            setLoading(false);
        }
    }, [pagination.page, pagination.limit, filters, debouncedSearch]); // Removed isAuthenticated as it's handled in the calling effect

    // Effect to fetch data whenever a filter, debounced search, or page number changes.
    useEffect(() => {
        if (isAuthenticated) { 
            fetchInvoices(); 
        }
    }, [fetchInvoices, isAuthenticated]);
    
    // Effect to fetch dropdown data for filters only once on page load.
    useEffect(() => {
        if (isAuthenticated) {
            getRecipientNames().then(response => setRecipientNames(response.data || [])).catch(err => console.error(err));
        }
    }, [isAuthenticated]);

    // Effect for WebSocket listener.
    useEffect(() => {
        if (isAuthenticated && socket) {
            const handleInvoiceUpdate = () => setHasNewInvoices(true);
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => socket.off('invoices:updated', handleInvoiceUpdate);
        }
    }, [isAuthenticated, socket]);

    // This is now the ONLY way filters are changed.
    const handleFilterChange = (newFilters) => {
        setPagination(p => ({ ...p, page: 1 })); // Reset to page 1 on any filter change
        setFilters(newFilters);
    };

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportInvoices(filters);
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

    const handleSave = () => { closeAllModals(); fetchInvoices(); };
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
                        <Button primary onClick={() => openEditModal(null)}><FaPlus /> Add Entry</Button>
                    </Actions>
                </Header>
                
                {hasNewInvoices && (
                    <RefreshBanner onClick={fetchInvoices}>
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