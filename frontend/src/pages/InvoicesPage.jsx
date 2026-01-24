import React, { useState, useEffect, useCallback } from "react";
import styled from "styled-components";
import { useAuth } from "../context/AuthContext";
import { usePermissions } from '../context/PermissionContext'; // 1. IMPORT PERMISSIONS HOOK
import {
  getInvoices,
  getRecipientNames,
  exportInvoices,
  deleteInvoice // Import delete function for table
} from "../services/api";
import { FaPlus, FaFileExcel, FaSyncAlt } from "react-icons/fa";
import InvoiceFilter from "../components/InvoiceFilter";
import InvoiceTable from "../components/InvoiceTable";
import InvoiceModal from "../components/InvoiceModal";
import LinkTransactionModal from "../components/LinkTransactionModal";
import { useSocket } from "../context/SocketContext";

// Debounce hook
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
  const { hasPermission } = usePermissions(); // 2. GET PERMISSION CHECKER
  const socket = useSocket();
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [recipientNames, setRecipientNames] = useState([]);
  const [hasNewInvoices, setHasNewInvoices] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
    totalRecords: 0,
  });
  const [filters, setFilters] = useState({
    search: "", dateFrom: "", dateTo: "", timeFrom: "", timeTo: "",
    sourceGroups: [], recipientNames: [], reviewStatus: "", status: "",
  });
  const { isAuthenticated } = useAuth();
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkingInvoice, setLinkingInvoice] = useState(null);

  const debouncedSearch = useDebounce(filters.search, 500);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setHasNewInvoices(false);
    try {
      const params = { ...filters, search: debouncedSearch, page: pagination.page, limit: pagination.limit };
      Object.keys(params).forEach(key => (!params[key] || (Array.isArray(params[key]) && params[key].length === 0)) && delete params[key]);
      const { data } = await getInvoices(params);
      setInvoices(data.invoices || []);
      setPagination((prev) => ({ ...prev, totalPages: data.totalPages, totalRecords: data.totalRecords }));
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, debouncedSearch]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchInvoices();
      getRecipientNames().then((res) => setRecipientNames(res.data));
    }
  }, [isAuthenticated, fetchInvoices]);

  useEffect(() => {
    if (socket) {
      socket.on("invoices:updated", () => setHasNewInvoices(true));
      return () => socket.off("invoices:updated");
    }
  }, [socket]);

  const handleFilterChange = (newFilters) => {
    setPagination((p) => ({ ...p, page: 1 }));
    setFilters(newFilters);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportParams = { ...filters, search: debouncedSearch };
      await exportInvoices(exportParams);
    } catch (error) {
      console.error("Failed to export invoices:", error);
      alert("Failed to export invoices.");
    } finally {
      setIsExporting(false);
    }
  };

  const openEditModal = (invoice) => {
    // Permission check before opening
    if (!hasPermission('invoice:edit') && invoice !== null) return;
    if (!hasPermission('invoice:create') && invoice === null) return;
    setEditingInvoice(invoice);
    setIsInvoiceModalOpen(true);
  };

  const openLinkModal = (invoice) => {
    if (!hasPermission('invoice:link')) return;
    setLinkingInvoice(invoice);
    setIsLinkModalOpen(true);
  };
  
  // 3. ADD DELETE HANDLER (was missing from table logic)
  const handleDelete = async (id) => {
      if (window.confirm('Are you sure you want to PERMANENTLY delete this invoice? This action cannot be undone.')) {
          try {
              await deleteInvoice(id);
              fetchInvoices(); // Refresh list after deleting
          } catch (error) {
              alert('Failed to delete invoice.');
          }
      }
  };

  const handleSaveAndRefresh = () => {
    closeAllModals();
    fetchInvoices();
  };

  const closeAllModals = () => {
    setIsInvoiceModalOpen(false);
    setEditingInvoice(null);
    setIsLinkModalOpen(false);
    setLinkingInvoice(null);
  };

  return (
    <>
      <PageContainer>
        <Header>
          <Title>Invoices</Title>
          <Actions>
            {/* 4. WRAP BUTTONS IN PERMISSION CHECKS */}
            {hasPermission('invoice:export') && (
              <Button onClick={handleExport} disabled={isExporting}>
                <FaFileExcel /> {isExporting ? "Exporting..." : "Export"}
              </Button>
            )}
            {hasPermission('invoice:create') && (
              <Button primary onClick={() => openEditModal(null)}>
                <FaPlus /> Add Entry
              </Button>
            )}
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
          onLink={openLinkModal}
          onDelete={handleDelete} // Pass delete handler
          pagination={pagination}
          setPagination={setPagination}
          hasPermission={hasPermission} // Pass the permission checker function down
        />
      </PageContainer>
      
      {/* Modals are implicitly protected since buttons that open them are checked */}
      <InvoiceModal
        isOpen={isInvoiceModalOpen}
        onClose={closeAllModals}
        onSave={handleSaveAndRefresh}
        invoice={editingInvoice}
        allGroups={allGroups}
      />

      <LinkTransactionModal
        isOpen={isLinkModalOpen}
        onClose={handleSaveAndRefresh}
        invoice={linkingInvoice}
      />
    </>
  );
};

export default InvoicesPage;