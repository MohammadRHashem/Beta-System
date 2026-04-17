import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import { usePermissions } from "../context/PermissionContext";
import { useAuth } from "../context/AuthContext";
import {
  deleteInvoice,
  exportInvoices,
  getInvoices,
  getRecipientNames,
} from "../services/api";
import { FaFileExcel, FaPlus } from "react-icons/fa";
import InvoiceFilter from "../components/InvoiceFilter";
import InvoiceTable from "../components/InvoiceTable";
import InvoiceModal from "../components/InvoiceModal";
import LinkTransactionModal from "../components/LinkTransactionModal";

const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

const RECIPIENT_CACHE_KEY = "invoiceRecipientNamesCache:v1";
const RECIPIENT_CACHE_TTL_MS = 60 * 1000;

const readRecipientCache = () => {
  try {
    const raw = sessionStorage.getItem(RECIPIENT_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.values) || Number(parsed.expiresAt || 0) < Date.now()) {
      sessionStorage.removeItem(RECIPIENT_CACHE_KEY);
      return null;
    }
    return parsed.values;
  } catch (_error) {
    sessionStorage.removeItem(RECIPIENT_CACHE_KEY);
    return null;
  }
};

const writeRecipientCache = (values) => {
  try {
    sessionStorage.setItem(
      RECIPIENT_CACHE_KEY,
      JSON.stringify({
        values,
        expiresAt: Date.now() + RECIPIENT_CACHE_TTL_MS,
      }),
    );
  } catch (_error) {
    // Ignore storage failures.
  }
};

const clearRecipientCache = () => {
  try {
    sessionStorage.removeItem(RECIPIENT_CACHE_KEY);
  } catch (_error) {
    // Ignore storage failures.
  }
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
  const { isAuthenticated } = useAuth();
  const latestFetchIdRef = useRef(0);

  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [recipientNames, setRecipientNames] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
    totalRecords: 0,
  });
  const [filters, setFilters] = useState({
    search: "",
    amountExact: "",
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
  const debouncedAmountExact = useDebounce(filters.amountExact, 420);

  const effectiveFilters = useMemo(
    () => ({
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      timeFrom: filters.timeFrom,
      timeTo: filters.timeTo,
      sourceGroups: filters.sourceGroups,
      recipientNames: filters.recipientNames,
      reviewStatus: filters.reviewStatus,
      status: filters.status,
      search: debouncedSearch,
      amountExact: debouncedAmountExact,
    }),
    [
      filters.dateFrom,
      filters.dateTo,
      filters.timeFrom,
      filters.timeTo,
      filters.sourceGroups,
      filters.recipientNames,
      filters.reviewStatus,
      filters.status,
      debouncedSearch,
      debouncedAmountExact,
    ],
  );

  const isTextFiltersDebouncing =
    filters.search !== debouncedSearch || filters.amountExact !== debouncedAmountExact;

  const fetchInvoices = useCallback(async () => {
    if (isTextFiltersDebouncing) return;

    const fetchId = ++latestFetchIdRef.current;
    setLoading(true);
    try {
      const params = {
        ...effectiveFilters,
        page: pagination.page,
        limit: pagination.limit,
      };

      Object.keys(params).forEach((key) => {
        if (!params[key] || (Array.isArray(params[key]) && params[key].length === 0)) {
          delete params[key];
        }
      });

      const { data } = await getInvoices(params);
      if (fetchId !== latestFetchIdRef.current) return;

      setInvoices(data.invoices || []);
      setPagination((prev) => ({
        ...prev,
        totalPages: data.totalPages,
        totalRecords: data.totalRecords,
      }));
    } catch (error) {
      if (fetchId !== latestFetchIdRef.current) return;
      console.error("Failed to fetch invoices:", error);
      setInvoices([]);
    } finally {
      if (fetchId !== latestFetchIdRef.current) return;
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, effectiveFilters, isTextFiltersDebouncing]);

  useEffect(() => {
    if (!isAuthenticated) return;
    fetchInvoices();
  }, [isAuthenticated, fetchInvoices]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const cachedRecipientNames = readRecipientCache();
    if (cachedRecipientNames) {
      setRecipientNames(cachedRecipientNames);
      return;
    }

    const timer = window.setTimeout(() => {
      getRecipientNames()
        .then((res) => {
          const nextRecipientNames = res.data || [];
          setRecipientNames(nextRecipientNames);
          writeRecipientCache(nextRecipientNames);
        })
        .catch(() => setRecipientNames([]));
    }, 120);

    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  const handleFilterChange = (nextFiltersOrUpdater) => {
    setPagination((prev) => (prev.page === 1 ? prev : { ...prev, page: 1 }));
    setFilters((prev) =>
      typeof nextFiltersOrUpdater === "function"
        ? nextFiltersOrUpdater(prev)
        : nextFiltersOrUpdater,
    );
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const exportParams = { ...effectiveFilters };
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
      clearRecipientCache();
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
    clearRecipientCache();
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
