import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
    const [filteredInvoices, setFilteredInvoices] = useState([]); // Holds data to be displayed
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

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        setHasNewInvoices(false);
        try {
            const params = { limit: 10000 }; 
            const { data } = await getInvoices(params);
            setAllInvoices(data.invoices || []);
            setFilteredInvoices(data.invoices || []);
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
            setAllInvoices([]);
            setFilteredInvoices([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated) { 
            fetchInvoices(); 
        }
    }, [fetchInvoices, isAuthenticated]);
    
    useEffect(() => {
        if (isAuthenticated) {
            getRecipientNames().then(response => setRecipientNames(response.data || [])).catch(err => console.error(err));
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated && socket) {
            const handleInvoiceUpdate = () => setHasNewInvoices(true);
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => socket.off('invoices:updated', handleInvoiceUpdate);
        }
    }, [isAuthenticated, socket]);

    useEffect(() => {
        setLoading(true);
        let invoicesToFilter = [...allInvoices];
        
        const { search, dateFrom, dateTo, timeFrom, timeTo, sourceGroups, recipientNames: recipientFilter, reviewStatus, status } = filters;
        
        // This logic correctly compares UTC time from DB with local time from the filter inputs
        const startDateTimeFilter = dateFrom ? new Date(`${dateFrom}T${timeFrom || '00:00:00'}`).getTime() : null;
        const endDateTimeFilter = dateTo ? new Date(`${dateTo}T${timeTo || '23:59:59'}`).getTime() : null;

        const filtered = invoicesToFilter.filter(inv => {
            const searchTerm = search.toLowerCase();

            if (searchTerm && !(inv.transaction_id?.toLowerCase().includes(searchTerm) || inv.sender_name?.toLowerCase().includes(searchTerm) || inv.recipient_name?.toLowerCase().includes(searchTerm) || inv.amount?.toLowerCase().includes(searchTerm))) return false;
            
            if (inv.received_at) {
                const invoiceDateTime = new Date(inv.received_at + 'Z').getTime();
                if (startDateTimeFilter && invoiceDateTime < startDateTimeFilter) return false;
                if (endDateTimeFilter && invoiceDateTime > endDateTimeFilter) return false;
            }

            if (sourceGroups.length > 0 && !sourceGroups.includes(inv.source_group_jid)) return false;
            if (recipientFilter.length > 0 && !recipientFilter.includes(inv.recipient_name)) return false;
            
            const needsReview = !inv.is_manual && (!inv.sender_name || !inv.recipient_name || !inv.amount || inv.amount === '0.00');
            if (reviewStatus === 'only_review' && !needsReview) return false;
            if (reviewStatus === 'hide_review' && needsReview) return false;
            if (status === 'only_deleted' && !inv.is_deleted) return false;
            if (status === 'only_duplicates') {
                // Correctly check for duplicates within the full dataset
                const isDuplicate = allInvoices.filter(i => i.transaction_id && i.transaction_id === inv.transaction_id).length > 1;
                if (!isDuplicate) return false;
            }

            return true;
        });

        setFilteredInvoices(filtered);
        setLoading(false);
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