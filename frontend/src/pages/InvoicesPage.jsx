import React, { useCallback, useEffect, useState } from "react";
import styled from "styled-components";
import { usePermissions } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import {
  deleteInvoice,
  exportInvoices,
  getInvoices,
  getRecipientNames,
} from "../services/api";
import { FaFileExcel, FaPlus, FaSyncAlt } from "react-icons/fa";
import InvoiceFilter from "../components/InvoiceFilter";
import InvoiceTable from "../components/InvoiceTable";
import InvoiceModal from "../components/InvoiceModal";
import LinkTransactionModal from "../components/LinkTransactionModal";
import { useSocket } from "../context/SocketContext";

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const PageContainer = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
`;

const HeaderCard = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 0.64rem 0.76rem;
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 1.12rem;
  font-weight: 800;
`;

const Actions = styled.div`
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  border-radius: 7px;
  border: 1px solid transparent;
  min-height: 30px;
  padding: 0.24rem 0.58rem;
  font-size: 0.76rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.32rem;
  cursor: pointer;
  background: ${({ theme, $variant }) => ($variant === "primary" ? theme.secondary : theme.primary)};
  color: #fff;

  &:disabled {
    opacity: 0.68;
  }
`;

const RefreshBanner = styled.button`
  width: 100%;
  margin-top: 0.48rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.secondarySoft};
  color: ${({ theme }) => theme.secondary};
  min-height: 32px;
  font-size: 0.76rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.38rem;
`;

const TableArea = styled.section`
  flex: 1;
  min-height: 0;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  overflow: hidden;
`;

const InvoicesPage = ({ allGroups }) => {
  const { hasPermission } = usePermissions();
  const socket = useSocket();
  const { isAuthenticated } = useAuth();

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
    search: "",
    dateFrom: "",
    dateTo: "",
    timeFrom: "",
    timeTo: "",
    sourceGroups: [],
    recipientNames: [],
    reviewStatus: "",
    status: "",
  });

  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState(null);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [linkingInvoice, setLinkingInvoice] = useState(null);

  const debouncedSearch = useDebounce(filters.search, 420);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setHasNewInvoices(false);
    try {
      const params = {
        ...filters,
        search: debouncedSearch,
        page: pagination.page,
        limit: pagination.limit,
      };

      Object.keys(params).forEach((key) => {
        if (!params[key] || (Array.isArray(params[key]) && params[key].length === 0)) {
          delete params[key];
        }
      });

      const { data } = await getInvoices(params);
      setInvoices(data.invoices || []);
      setPagination((prev) => ({
        ...prev,
        totalPages: data.totalPages,
        totalRecords: data.totalRecords,
      }));
    } catch (error) {
      console.error("Failed to fetch invoices:", error);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, filters, debouncedSearch]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchInvoices();
    getRecipientNames().then((res) => setRecipientNames(res.data || []));
  }, [isAuthenticated, fetchInvoices]);

  useEffect(() => {
    if (!socket) return undefined;
    socket.on("invoices:updated", () => setHasNewInvoices(true));
    return () => socket.off("invoices:updated");
  }, [socket]);

  const handleFilterChange = (newFilters) => {
    setPagination((prev) => ({ ...prev, page: 1 }));
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
    if (!hasPermission("invoice:edit") && invoice !== null) return;
    if (!hasPermission("invoice:create") && invoice === null) return;
    setEditingInvoice(invoice);
    setIsInvoiceModalOpen(true);
  };

  const openLinkModal = (invoice) => {
    if (!hasPermission("invoice:link")) return;
    setLinkingInvoice(invoice);
    setIsLinkModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to permanently delete this invoice?")) return;
    try {
      await deleteInvoice(id);
      fetchInvoices();
    } catch (_error) {
      alert("Failed to delete invoice.");
    }
  };

  const closeAllModals = () => {
    setIsInvoiceModalOpen(false);
    setEditingInvoice(null);
    setIsLinkModalOpen(false);
    setLinkingInvoice(null);
  };

  const handleSaveAndRefresh = () => {
    closeAllModals();
    fetchInvoices();
  };

  return (
    <>
      <PageContainer>
        <HeaderCard>
          <HeaderTop>
            <Title>Invoices</Title>
            <Actions>
              {hasPermission("invoice:export") && (
                <Button type="button" onClick={handleExport} disabled={isExporting}>
                  <FaFileExcel /> {isExporting ? "Exporting..." : "Export"}
                </Button>
              )}
              {hasPermission("invoice:create") && (
                <Button type="button" $variant="primary" onClick={() => openEditModal(null)}>
                  <FaPlus /> Add Entry
                </Button>
              )}
            </Actions>
          </HeaderTop>

          {hasNewInvoices && (
            <RefreshBanner type="button" onClick={fetchInvoices}>
              <FaSyncAlt /> New invoices arrived. Click to refresh.
            </RefreshBanner>
          )}
        </HeaderCard>

        <InvoiceFilter
          filters={filters}
          onFilterChange={handleFilterChange}
          allGroups={allGroups}
          recipientNames={recipientNames}
        />

        <TableArea>
          <InvoiceTable
            invoices={invoices}
            loading={loading}
            onEdit={openEditModal}
            onLink={openLinkModal}
            onDelete={handleDelete}
            pagination={pagination}
            setPagination={setPagination}
            hasPermission={hasPermission}
          />
        </TableArea>
      </PageContainer>

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
