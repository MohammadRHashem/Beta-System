import React, { useState, useEffect, useCallback, useMemo } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { getInvoices, getRecipientNames, exportInvoices } from '../services/api';
import { FaPlus, FaFileExcel, FaSyncAlt } from 'react-icons/fa';
import InvoiceFilter from '../components/InvoiceFilter';
import InvoiceTable from '../components/InvoiceTable';
import InvoiceModal from '../components/InvoiceModal';

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
    const [allInvoices, setAllInvoices] = useState([]); // Holds all data from the server
    const [loading, setLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [recipientNames, setRecipientNames] = useState([]);
    const [hasNewInvoices, setHasNewInvoices] = useState(false);
    
    const [filters, setFilters] = useState({
        search: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
        sourceGroups: [],
        recipientNames: [],
        reviewStatus: '',
        status: '',
    });
    
    const { isAuthenticated } = useAuth();
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

    // This is a custom hook for debouncing, which is cleaner
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

    // We only debounce the primary date filters for server-side fetching
    const debouncedDateFrom = useDebounce(filters.dateFrom, 500);
    const debouncedDateTo = useDebounce(filters.dateTo, 500);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setHasNewInvoices(false);
        try {
            const params = { 
                dateFrom: debouncedDateFrom, 
                dateTo: debouncedDateTo,
                limit: 10000 
            };
            const { data } = await getInvoices(params);
            setAllInvoices(data.invoices || []); // Ensure it's always an array
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
            setAllInvoices([]); // Set to empty array on error
        } finally {
            setLoading(false);
        }
    }, [debouncedDateFrom, debouncedDateTo]);

    // Effect to fetch initial data and re-fetch when the debounced date range changes
    useEffect(() => {
        if (isAuthenticated) { 
            fetchInvoices(); 
        }
    }, [fetchInvoices, isAuthenticated]);
    
    // Effect to fetch the dropdown data for filters only once
    useEffect(() => {
        if (isAuthenticated) {
            getRecipientNames().then(response => setRecipientNames(response.data)).catch(err => console.error(err));
        }
    }, [isAuthenticated]);

    // This is the SINGLE, CORRECT socket listener. It just sets the banner flag.
    useEffect(() => {
        if (isAuthenticated && socket) {
            const handleInvoiceUpdate = () => {
                setHasNewInvoices(true);
            };
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => {
                socket.off('invoices:updated', handleInvoiceUpdate);
            };
        }
    }, [isAuthenticated, socket]);


    // This useMemo performs INSTANT client-side filtering whenever filters change.
    const filteredInvoices = useMemo(() => {
        return allInvoices.filter(inv => {
            const { search, sourceGroups, recipientNames: recipientFilter, reviewStatus, status } = filters;
            const searchTerm = search.toLowerCase();

            if (searchTerm && !(inv.transaction_id?.toLowerCase().includes(searchTerm) || inv.sender_name?.toLowerCase().includes(searchTerm) || inv.recipient_name?.toLowerCase().includes(searchTerm) || inv.amount?.toLowerCase().includes(searchTerm))) return false;
            if (sourceGroups.length > 0 && !sourceGroups.includes(inv.source_group_jid)) return false;
            if (recipientFilter.length > 0 && !recipientFilter.includes(inv.recipient_name)) return false;
            const needsReview = !inv.is_manual && (!inv.sender_name || !inv.recipient_name || !inv.amount || inv.amount === '0.00');
            if (reviewStatus === 'only_review' && !needsReview) return false;
            if (reviewStatus === 'hide_review' && needsReview) return false;
            if (status === 'only_deleted' && !inv.is_deleted) return false;
            if (status === 'only_duplicates') {
                const isDuplicate = allInvoices.filter(i => i.transaction_id && i.transaction_id === inv.transaction_id).length > 1;
                if (!isDuplicate) return false;
            }

            return true;
        });
    }, [allInvoices, filters]);


    const handleFilterChange = (newFilters) => {
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

    const closeAllModals = () => {
        setIsInvoiceModalOpen(false);
        setEditingInvoice(null);
    };

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
                    invoices={filteredInvoices}
                    loading={loading}
                    onEdit={openEditModal}
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