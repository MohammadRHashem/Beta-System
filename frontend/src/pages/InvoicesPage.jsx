import React, { useState, useEffect, useCallback } from 'react';
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
    /* Allow the page container to take full height for scrolling table */
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
`;

const InvoicesPage = ({ allGroups, socket }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [recipientNames, setRecipientNames] = useState([]);
    
    // === THE EDIT: Remove pagination state entirely ===
    
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
        try {
            // === THE EDIT: Set a very high limit to fetch all records, removing page number ===
            const params = { ...filters, limit: 10000 }; 
            Object.keys(params).forEach(key => (!params[key] || params[key].length === 0) && delete params[key]);
            const { data } = await getInvoices(params);
            setInvoices(data.invoices);
        } catch (error) {
            console.error("Failed to fetch invoices:", error);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => {
        if (isAuthenticated) { fetchInvoices(); }
    }, [fetchInvoices, isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated) {
            const fetchFilterData = async () => {
                try {
                    const { data: recipients } = await getRecipientNames();
                    setRecipientNames(recipients);
                } catch (error) {
                    console.error("Failed to fetch recipient names:", error);
                }
            };
            fetchFilterData();
        }
    }, [isAuthenticated]);

    useEffect(() => {
        if (isAuthenticated && socket) {
            const handleInvoiceUpdate = () => {
                fetchInvoices();
            };
            socket.on('invoices:updated', handleInvoiceUpdate);
            return () => {
                socket.off('invoices:updated', handleInvoiceUpdate);
            };
        }
    }, [isAuthenticated, socket, fetchInvoices]);

    const handleFilterChange = (newFilters) => {
        setFilters(newFilters);
    };

    const handleExport = async () => {
        try {
            await exportInvoices(filters);
        } catch (error) {
            console.error("Failed to export invoices:", error);
            alert("Failed to export invoices.");
        }
    };
    
    const openEditModal = (invoice) => {
        setEditingInvoice(invoice);
        setIsInvoiceModalOpen(true);
    };

    const handleSave = () => {
        closeAllModals();
        fetchInvoices();
    };

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