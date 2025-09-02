import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled from 'styled-components';
import { useAuth } from '../context/AuthContext';
import { getInvoices, getRecipientNames, exportInvoices, importInvoices } from '../services/api';
import { FaPlus, FaFileExcel, FaUpload } from 'react-icons/fa';
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
    background-color: ${({ theme, primary, secondary }) => 
        primary ? theme.secondary : (secondary ? '#17a2b8' : theme.primary)};
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

// Hidden file input for the import button
const HiddenInput = styled.input`
    display: none;
`;

const InvoicesPage = ({ allGroups, socket }) => {
    const [invoices, setInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isImporting, setIsImporting] = useState(false);
    const [recipientNames, setRecipientNames] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
    
    const [filters, setFilters] = useState({
        search: '', dateFrom: '', dateTo: '', timeFrom: '', timeTo: '',
        sourceGroups: [],
        recipientNames: [],
        reviewStatus: '',
        status: '',
    });

    const fileInputRef = useRef(null);
    const { isAuthenticated } = useAuth();
    
    const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
    const [editingInvoice, setEditingInvoice] = useState(null);

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
                console.log('[Socket.io] Received invoices:updated event, refetching...');
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

    const handleExport = async () => {
        try {
            await exportInvoices(filters);
        } catch (error) {
            console.error("Failed to export invoices:", error);
            alert("Failed to export invoices.");
        }
    };

    const handleImportClick = () => {
        fileInputRef.current.click();
    };
    
    const handleFileSelected = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        if (!window.confirm("Are you sure you want to import this file? This will update existing records and create new ones based on the file content. This action cannot be undone.")) {
            return;
        }

        setIsImporting(true);
        try {
            const { data } = await importInvoices(file);
            alert(data.message);
            fetchInvoices(); // Refresh data after successful import
        } catch (error) {
            console.error("Failed to import invoices:", error);
            alert(`Import failed: ${error.response?.data?.message || 'An unknown error occurred.'}`);
        } finally {
            setIsImporting(false);
            // Reset the input value to allow re-uploading the same file
            event.target.value = null; 
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
                        <HiddenInput type="file" ref={fileInputRef} onChange={handleFileSelected} accept=".xlsx, .xls" />
                        <Button secondary onClick={handleImportClick} disabled={isImporting}>
                            <FaUpload /> {isImporting ? 'Importing...' : 'Import & Sync'}
                        </Button>
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
                    loading={loading || isImporting}
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