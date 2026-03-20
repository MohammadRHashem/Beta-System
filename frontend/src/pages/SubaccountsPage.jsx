import React, { useCallback, useEffect, useMemo, useState } from "react";
import styled, { css, useTheme } from "styled-components";
import { usePermissions } from "../context/PermissionContext";
import {
  createSubaccountProfileEntry,
  createCrossDebit,
  createPortalAccessSession,
  createSubaccount,
  deleteSubaccountProfileEntry,
  deleteSubaccount,
  getRecibosTransactions,
  getSubaccountProfileEntries,
  getSubaccountCredentials,
  getSubaccounts,
  reassignTransaction,
  resetSubaccountPassword,
  triggerHardRefresh,
  updateSubaccountProfileEntry,
  updateSubaccount,
} from "../services/api";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import {
  FaCopy,
  FaEdit,
  FaExchangeAlt,
  FaExternalLinkAlt,
  FaHistory,
  FaIdCard,
  FaKey,
  FaMagic,
  FaMinusCircle,
  FaPlus,
  FaQrcode,
  FaTrash,
} from "react-icons/fa";
import ComboBox from "../components/ComboBox";
import Select from "react-select";

const PageContainer = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  overflow: auto;
  padding-right: 0.08rem;
`;

const PageCard = styled.section`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${({ theme }) => theme.shadowSm};
  min-height: 0;
  display: flex;
  flex-direction: column;
`;

const Header = styled(PageCard)`
  padding: 0.66rem 0.74rem;
  gap: 0.5rem;
`;

const HeaderTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.72rem;
  flex-wrap: wrap;
`;

const TitleBlock = styled.div`
  min-width: 0;

  h2 {
    margin: 0;
    font-size: 1.06rem;
    font-weight: 800;
  }

  p {
    margin: 0.25rem 0 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.78rem;
  }
`;

const ActionsRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const Button = styled.button`
  border: 1px solid transparent;
  background: ${({ theme }) => theme.secondary};
  color: #fff;
  font-weight: 800;
  font-size: 0.78rem;
  padding: 0.36rem 0.68rem;
  border-radius: 8px;
  min-height: 30px;
  display: inline-flex;
  align-items: center;
  gap: 0.42rem;
  cursor: pointer;

  ${({ $variant, theme }) =>
    $variant === "danger" &&
    css`
      background: ${theme.error};
    `}

  ${({ $variant, theme }) =>
    $variant === "dark" &&
    css`
      background: ${theme.primary};
    `}
`;

const DataCard = styled(PageCard)`
  flex: 1;
  min-height: 0;
  padding: 0.52rem;
  overflow: auto;
`;

const TableWrap = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surface};
  min-height: 0;
  flex: 1;
  overflow: auto;
`;

const Table = styled.table`
  width: 100%;
  min-width: 930px;
  border-collapse: collapse;

  th,
  td {
    padding: 0.4rem 0.46rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    text-align: left;
    white-space: nowrap;
    font-size: 0.77rem;
    line-height: 1.2;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 2;
    background: ${({ theme }) => theme.surfaceAlt};
    font-size: 0.67rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  tbody tr:hover {
    background: ${({ theme }) =>
      theme.mode === "dark" ? "rgba(96,165,250,0.12)" : "rgba(37,99,235,0.08)"};
  }
`;

const TypeChip = styled.span`
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  font-weight: 800;
  font-size: 0.7rem;
  padding: 0.12rem 0.44rem;
  border: 1px solid transparent;

  ${({ $type, theme }) =>
    $type === "cross"
      ? css`
          color: ${theme.success};
          background: rgba(22, 163, 74, 0.12);
          border-color: rgba(22, 163, 74, 0.28);
        `
      : css`
          color: ${theme.secondary};
          background: ${theme.secondarySoft};
          border-color: rgba(37, 99, 235, 0.22);
        `}
`;

const EmptyText = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.78rem;
`;

const ActionIcons = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
`;

const IconButton = styled.button`
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 6px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover {
    border-color: ${({ theme }) => theme.borderStrong};
  }
`;

const ModalTitle = styled.h2`
  margin: 0 0 0.7rem;
  font-size: 1.04rem;
`;

const ModalForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 0.86rem;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
`;

const Label = styled.label`
  font-size: 0.78rem;
  font-weight: 700;
  color: ${({ theme }) => theme.primarySoft};
`;

const Input = styled.input`
  width: 100%;
`;

const RadioWrap = styled.div`
  display: flex;
  gap: 0.8rem;
  flex-wrap: wrap;
`;

const RadioOption = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: ${({ theme }) => theme.text};
`;

const InlineBox = styled.div`
  padding: 0.56rem 0.64rem;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  background: ${({ theme }) => theme.surfaceAlt};
  font-size: 0.8rem;
`;

const CredentialCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  padding: 0.68rem;
  background: ${({ theme }) => theme.surfaceAlt};

  h4 {
    margin: 0 0 0.45rem;
    font-size: 0.86rem;
  }

  p {
    margin: 0;
    font-size: 0.8rem;
    color: ${({ theme }) => theme.lightText};
  }

  strong {
    font-family: "IBM Plex Mono", Consolas, monospace;
    color: ${({ theme }) => theme.primary};
    font-size: 0.8rem;
  }
`;

const HelperText = styled.p`
  margin: 0;
  font-size: 0.77rem;
  color: ${({ theme }) => theme.lightText};
`;

const RecibosTableWrap = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
  overflow: auto;
  max-height: 56vh;
`;

const RecibosTable = styled.table`
  width: 100%;
  min-width: 840px;

  th,
  td {
    padding: 0.5rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    font-size: 0.78rem;
    text-align: left;
    vertical-align: middle;
  }

  th {
    position: sticky;
    top: 0;
    background: ${({ theme }) => theme.surfaceAlt};
    z-index: 1;
    text-transform: uppercase;
    font-size: 0.68rem;
    letter-spacing: 0.05em;
  }
`;

const RecibosToolbar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
  flex-wrap: wrap;
  margin: 0.6rem 0 0.5rem;
`;

const RecibosMeta = styled.span`
  font-size: 0.78rem;
  color: ${({ theme }) => theme.lightText};
`;

const RecibosControls = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
`;

const RecibosFiltersGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(220px, 1.2fr) minmax(220px, 1.2fr) minmax(140px, 0.8fr);
  gap: 0.7rem;
  margin-bottom: 0.7rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const RecibosSummaryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.6rem;
  margin-bottom: 0.75rem;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const RecibosSummaryCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.65rem 0.75rem;

  strong {
    display: block;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: ${({ theme }) => theme.lightText};
    margin-bottom: 0.18rem;
  }

  span {
    display: block;
    font-size: 0.9rem;
    font-weight: 800;
    color: ${({ theme }) => theme.primary};
  }
`;

const RecibosPageSize = styled.select`
  min-height: 32px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.3rem 0.45rem;
  font-weight: 600;
`;

const AssignCell = styled.div`
  display: flex;
  align-items: center;
  gap: 0.35rem;

  .select {
    min-width: 180px;
    width: 220px;
  }
`;

const SuggestionBadge = styled.button`
  border: 1px solid rgba(37, 99, 235, 0.28);
  border-radius: 999px;
  background: ${({ theme }) => theme.secondarySoft};
  color: ${({ theme }) => theme.secondary};
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.48rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  cursor: pointer;
`;

const FooterActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  flex-wrap: wrap;
`;

const ProfileModalLayout = styled.div`
  display: grid;
  grid-template-columns: minmax(280px, 1.1fr) minmax(320px, 1fr);
  gap: 0.9rem;

  @media (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`;

const ProfilePanel = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.8rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
`;

const ProfilePanelTitle = styled.h3`
  margin: 0;
  font-size: 0.92rem;
`;

const ProfileEntriesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  max-height: 54vh;
  overflow: auto;
`;

const ProfileEntryCard = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.surface};
  padding: 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
`;

const ProfileEntryTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.6rem;
  align-items: flex-start;
`;

const ProfileEntryMeta = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  align-items: center;
`;

const ProfileMetaChip = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  font-size: 0.68rem;
  font-weight: 700;
  padding: 0.18rem 0.48rem;
`;

const ProfileEntryFields = styled.div`
  display: grid;
  gap: 0.45rem;
`;

const ProfileFieldRow = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 0.45rem;
  align-items: start;
  font-size: 0.78rem;

  strong {
    color: ${({ theme }) => theme.lightText};
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.66rem;
    margin-top: 0.14rem;
  }

  span {
    color: ${({ theme }) => theme.text};
    word-break: break-word;
  }
`;

const ProfileCodeRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;

  code {
    flex: 1;
    min-width: 0;
    padding: 0.55rem 0.7rem;
    border-radius: 10px;
    background: ${({ theme }) => theme.surfaceAlt};
    border: 1px solid ${({ theme }) => theme.border};
    font-size: 0.75rem;
    word-break: break-all;
  }
`;

const LargeTextArea = styled.textarea`
  width: 100%;
  min-height: 110px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.7rem 0.78rem;
  resize: vertical;
`;

const modalSelectStyles = {
  menuPortal: (base) => ({ ...base, zIndex: 10000 }),
  control: (base) => ({ ...base, minHeight: 32 }),
  valueContainer: (base) => ({ ...base, paddingTop: 0, paddingBottom: 0 }),
};

const SubaccountsPage = ({ allGroups }) => {
  const { hasPermission } = usePermissions();
  const canManageSubaccounts = hasPermission("subaccount:manage");
  const canManageCredentials = hasPermission("subaccount:manage_credentials");
  const canReassign = hasPermission("subaccount:reassign_transactions");
  const canPortalAccess = hasPermission("client_portal:access");
  const canCrossDebit = hasPermission("subaccount:debit_cross");

  const [subaccounts, setSubaccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSubaccount, setEditingSubaccount] = useState(null);
  const [isCredsModalOpen, setIsCredsModalOpen] = useState(false);
  const [currentCreds, setCurrentCreds] = useState(null);
  const [credsLoading, setCredsLoading] = useState(false);
  const [isRecibosModalOpen, setIsRecibosModalOpen] = useState(false);
  const [recibosAccountId, setRecibosAccountId] = useState(null);
  const [recibosTransactions, setRecibosTransactions] = useState([]);
  const [recibosLoading, setRecibosLoading] = useState(false);
  const [recibosFilters, setRecibosFilters] = useState({
    search: "",
    amountExact: "",
    targetSubaccountNumber: "",
  });
  const [recibosPagination, setRecibosPagination] = useState({
    page: 1,
    currentPage: 1,
    limit: 50,
    totalPages: 1,
    totalRecords: 0,
  });
  const [isDebitModalOpen, setIsDebitModalOpen] = useState(false);
  const [debitSubaccount, setDebitSubaccount] = useState(null);
  const [debitForm, setDebitForm] = useState({ amount: "", tx_date: "", description: "USD BETA OUT / C" });
  const [profileSubaccount, setProfileSubaccount] = useState(null);

  const fetchSubaccounts = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await getSubaccounts();
      setSubaccounts(data);
    } catch (_error) {
      alert("Failed to fetch subaccounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSubaccounts();
  }, [fetchSubaccounts]);

  const handleOpenModal = (subaccount = null) => {
    setEditingSubaccount(subaccount);
    setIsModalOpen(true);
  };

  const handleCloseModals = () => {
    setIsModalOpen(false);
    setEditingSubaccount(null);
    setIsCredsModalOpen(false);
    setCurrentCreds(null);
    setIsRecibosModalOpen(false);
    setRecibosAccountId(null);
    setRecibosTransactions([]);
    setRecibosFilters({
      search: "",
      amountExact: "",
      targetSubaccountNumber: "",
    });
    setRecibosPagination({
      page: 1,
      currentPage: 1,
      limit: 50,
      totalPages: 1,
      totalRecords: 0,
    });
    setIsDebitModalOpen(false);
    setDebitSubaccount(null);
    setProfileSubaccount(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure? This will also delete any associated client portal credentials.")) {
      return;
    }
    try {
      await deleteSubaccount(id);
      fetchSubaccounts();
    } catch (_error) {
      alert("Failed to delete.");
    }
  };

  const handleCredentials = async (subaccount) => {
    setCredsLoading(true);
    setIsCredsModalOpen(true);
    try {
      const { data } = await getSubaccountCredentials(subaccount.id);
      setCurrentCreds({
        ...data,
        subaccountId: subaccount.id,
        subaccountName: subaccount.name,
      });
    } catch (_error) {
      alert("Failed to get credentials.");
      handleCloseModals();
    } finally {
      setCredsLoading(false);
    }
  };

  const handleResetPassword = async (subaccountId, type) => {
    if (!window.confirm(`Reset ${type === "master" ? "Full Access" : "View-Only"} password?`)) {
      return;
    }
    setCredsLoading(true);
    try {
      const { data } = await resetSubaccountPassword(subaccountId, type);
      setCurrentCreds((prev) => {
        if (type === "master") return { ...prev, masterPassword: data.password };
        return { ...prev, viewOnlyPassword: data.password };
      });
    } catch (_error) {
      alert("Failed to reset password.");
    } finally {
      setCredsLoading(false);
    }
  };

  const fetchRecibosData = async (subNumber, options = {}) => {
    if (!subNumber) return;
    const currentFilters = options.filters ?? recibosFilters;
    const requestedPage = options.page ?? 1;
    const requestedLimit = options.limit ?? recibosPagination.limit ?? 50;

    setRecibosLoading(true);
    try {
      const { data } = await getRecibosTransactions(subNumber, {
        page: requestedPage,
        limit: requestedLimit,
        ...currentFilters,
      });

      const payload = Array.isArray(data)
        ? {
            items: data,
            currentPage: 1,
            totalPages: 1,
            totalRecords: data.length,
            limit: requestedLimit,
          }
        : (data || {});

      const nextRows = Array.isArray(payload.items) ? payload.items : [];
      setRecibosTransactions(nextRows);

      setRecibosPagination((prev) => ({
        ...prev,
        page: Number(payload.currentPage ?? requestedPage),
        currentPage: Number(payload.currentPage ?? requestedPage),
        totalPages: Math.max(Number(payload.totalPages ?? 1), 1),
        totalRecords: Number(payload.totalRecords ?? nextRows.length),
        limit: payload.limit ?? requestedLimit,
      }));
    } catch (_error) {
      alert("Failed to fetch Recibos transactions.");
    } finally {
      setRecibosLoading(false);
    }
  };

  const handleReassign = async (txId, targetSubaccountNumber) => {
    if (!window.confirm("Move this transaction to the selected client?")) return;
    try {
      await reassignTransaction(txId, targetSubaccountNumber);
      setRecibosTransactions((prev) => prev.filter((tx) => tx.id !== txId));
      setRecibosPagination((prev) => ({
        ...prev,
        totalRecords: Math.max(0, Number(prev.totalRecords || 0) - 1),
      }));
    } catch (_error) {
      alert("Failed to reassign transaction.");
    }
  };

  const handleHardRefresh = async (subaccount) => {
    if (
      !window.confirm(
        `This will perform a full historical re-sync for "${subaccount.name}" to find and add missing transactions. Continue?`,
      )
    ) {
      return;
    }
    try {
      const { data } = await triggerHardRefresh(subaccount.id);
      alert(data.message);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to start refresh.");
    }
  };

  const handleOpenPortal = async (subaccount) => {
    if (!window.confirm(`Open portal for "${subaccount.name}" in FULL access?`)) {
      return;
    }

    const portalWindow = window.open("about:blank", "_blank");
    if (!portalWindow) {
      alert("Pop-up blocked. Please allow pop-ups for this site.");
      return;
    }

    try {
      portalWindow.opener = null;
      portalWindow.document.title = "Opening client portal...";
      portalWindow.document.body.innerHTML =
        '<p style="font-family: sans-serif; padding: 24px;">Opening client portal...</p>';
    } catch (_error) {
      // noop
    }

    try {
      const { data } = await createPortalAccessSession(subaccount.id);
      const params = new URLSearchParams();
      params.set("token", data.token);
      params.set("client", JSON.stringify(data.client));
      portalWindow.location.href = `${window.location.origin}/portal/impersonate#${params.toString()}`;
      portalWindow.focus();
    } catch (error) {
      portalWindow.close();
      alert(error.response?.data?.message || "Failed to open client portal.");
    }
  };

  const formatLocalDateTime = (date) => {
    const pad = (value) => `${value}`.padStart(2, "0");
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const handleOpenDebitModal = (subaccount) => {
    setDebitSubaccount(subaccount);
    setDebitForm({
      amount: "",
      tx_date: formatLocalDateTime(new Date()),
      description: "USD BETA OUT / C",
    });
    setIsDebitModalOpen(true);
  };

  const handleDebitSubmit = async (event) => {
    event.preventDefault();
    if (!debitSubaccount) return;

    const trimmedDate = (debitForm.tx_date || "").trim();
    const formattedDate = trimmedDate.includes("T")
      ? `${trimmedDate.replace("T", " ")}:00`.replace(":00:00", ":00")
      : trimmedDate;

    try {
      await createCrossDebit(debitSubaccount.id, {
        amount: debitForm.amount,
        tx_date: formattedDate,
        description: debitForm.description,
      });
      alert("Debit added successfully.");
      handleCloseModals();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to add debit.");
    }
  };

  return (
    <>
      <PageContainer>
        <Header>
          <HeaderTop>
            <TitleBlock>
              <h2>Subaccount Management</h2>
              <p>
                Manage XPayz and Cross subaccounts, credentials, and internal "Recibos" transfers.
              </p>
            </TitleBlock>
            <ActionsRow>
              {canReassign && (
                <Button type="button" $variant="dark" onClick={() => setIsRecibosModalOpen(true)}>
                  <FaExchangeAlt /> Manage Recibos
                </Button>
              )}
              {canManageSubaccounts && (
                <Button type="button" onClick={() => handleOpenModal(null)}>
                  <FaPlus /> Add Subaccount
                </Button>
              )}
            </ActionsRow>
          </HeaderTop>
        </Header>

        <DataCard>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Identifier (Number/PIX)</th>
                  <th>Assigned Group</th>
                  {(canManageSubaccounts || canManageCredentials || canPortalAccess || canCrossDebit) && (
                    <th>Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan="5">Loading...</td>
                  </tr>
                )}
                {!loading && subaccounts.length === 0 && (
                  <tr>
                    <td colSpan="5">
                      <EmptyText>No subaccounts found.</EmptyText>
                    </td>
                  </tr>
                )}
                {!loading &&
                  subaccounts.map((acc) => (
                    <tr key={acc.id}>
                      <td>{acc.name}</td>
                      <td>
                        <TypeChip $type={acc.account_type}>{acc.account_type.toUpperCase()}</TypeChip>
                      </td>
                      <td>{acc.account_type === "cross" ? acc.chave_pix : acc.subaccount_number}</td>
                      <td>{acc.assigned_group_name || <EmptyText>None</EmptyText>}</td>
                      {(canManageSubaccounts || canManageCredentials || canPortalAccess || canCrossDebit) && (
                        <td>
                          <ActionIcons>
                            {canManageCredentials && (
                              <IconButton type="button" onClick={() => handleCredentials(acc)} title="Manage Credentials">
                                <FaKey />
                              </IconButton>
                            )}
                            {canPortalAccess && (
                              <IconButton type="button" onClick={() => handleOpenPortal(acc)} title="Open Client Portal">
                                <FaExternalLinkAlt />
                              </IconButton>
                            )}
                            {canManageSubaccounts && (
                              <IconButton type="button" onClick={() => setProfileSubaccount(acc)} title="Manage Portal Profile">
                                <FaIdCard />
                              </IconButton>
                            )}
                            {canCrossDebit && acc.account_type === "cross" && (
                              <IconButton type="button" onClick={() => handleOpenDebitModal(acc)} title="Add Cross Debit">
                                <FaMinusCircle />
                              </IconButton>
                            )}
                            {canManageSubaccounts && acc.account_type === "xpayz" && (
                              <IconButton type="button" onClick={() => handleHardRefresh(acc)} title="Hard Refresh History">
                                <FaHistory />
                              </IconButton>
                            )}
                            {canManageSubaccounts && (
                              <IconButton type="button" onClick={() => handleOpenModal(acc)} title="Edit">
                                <FaEdit />
                              </IconButton>
                            )}
                            {canManageSubaccounts && (
                              <IconButton type="button" onClick={() => handleDelete(acc.id)} title="Delete">
                                <FaTrash />
                              </IconButton>
                            )}
                          </ActionIcons>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </Table>
          </TableWrap>
        </DataCard>
      </PageContainer>

      {canManageSubaccounts && (
        <SubaccountModal
          isOpen={isModalOpen}
          onClose={handleCloseModals}
          onSave={fetchSubaccounts}
          subaccount={editingSubaccount}
          allGroups={allGroups}
        />
      )}

      {canManageCredentials && (
        <CredentialsModal
          isOpen={isCredsModalOpen}
          onClose={handleCloseModals}
          credentials={currentCreds}
          onReset={handleResetPassword}
          loading={credsLoading}
        />
      )}

      {canReassign && (
        <RecibosModal
          isOpen={isRecibosModalOpen}
          onClose={handleCloseModals}
          subaccounts={subaccounts}
          loading={recibosLoading}
          transactions={recibosTransactions}
          pagination={recibosPagination}
          onSelectAccount={(id) => {
            setRecibosAccountId(id);
            setRecibosTransactions([]);
            const resetFilters = {
              search: "",
              amountExact: "",
              targetSubaccountNumber: "",
            };
            setRecibosFilters(resetFilters);
            setRecibosPagination((prev) => ({
              ...prev,
              page: 1,
              currentPage: 1,
            }));
            fetchRecibosData(id, { page: 1, filters: resetFilters });
          }}
          filters={recibosFilters}
          onFiltersChange={(patch) => {
            const nextFilters = { ...recibosFilters, ...patch };
            setRecibosFilters(nextFilters);
            setRecibosPagination((prev) => ({
              ...prev,
              page: 1,
              currentPage: 1,
            }));
            fetchRecibosData(recibosAccountId, { page: 1, filters: nextFilters });
          }}
          selectedAccountId={recibosAccountId}
          onPageChange={(nextPage) => fetchRecibosData(recibosAccountId, { page: nextPage })}
          onPageSizeChange={(nextLimit) => {
            setRecibosPagination((prev) => ({
              ...prev,
              page: 1,
              currentPage: 1,
              limit: nextLimit,
            }));
            fetchRecibosData(recibosAccountId, { page: 1, limit: nextLimit, filters: recibosFilters });
          }}
          onReassign={handleReassign}
        />
      )}

      {canCrossDebit && (
        <CrossDebitModal
          isOpen={isDebitModalOpen}
          onClose={handleCloseModals}
          subaccount={debitSubaccount}
          form={debitForm}
          setForm={setDebitForm}
          onSubmit={handleDebitSubmit}
        />
      )}

      {canManageSubaccounts && (
        <SubaccountProfileModal
          isOpen={Boolean(profileSubaccount)}
          onClose={handleCloseModals}
          subaccount={profileSubaccount}
        />
      )}
    </>
  );
};

const SubaccountModal = ({ isOpen, onClose, onSave, subaccount, allGroups }) => {
  const [formData, setFormData] = useState({
    name: "",
    account_type: "xpayz",
    subaccount_number: "",
    chave_pix: "",
    assigned_group_jid: "",
  });

  useEffect(() => {
    if (!isOpen) return;
    if (subaccount) {
      setFormData({
        name: subaccount.name || "",
        account_type: subaccount.account_type || "xpayz",
        subaccount_number: subaccount.subaccount_number || "",
        chave_pix: subaccount.chave_pix || "",
        assigned_group_jid: subaccount.assigned_group_jid || "",
      });
      return;
    }

    setFormData({
      name: "",
      account_type: "xpayz",
      subaccount_number: "",
      chave_pix: "",
      assigned_group_jid: "",
    });
  }, [subaccount, isOpen]);

  const handleChange = (event) => {
    setFormData({ ...formData, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      if (subaccount) {
        await updateSubaccount(subaccount.id, formData);
      } else {
        await createSubaccount(formData);
      }
      onSave();
      onClose();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save subaccount.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="560px">
      <ModalTitle>{subaccount ? "Edit Subaccount" : "Create Subaccount"}</ModalTitle>
      <ModalForm onSubmit={handleSubmit}>
        <InputGroup>
          <Label>Subaccount Name</Label>
          <Input
            name="name"
            value={formData.name}
            onChange={handleChange}
            placeholder="e.g., Jupeter"
            required
          />
        </InputGroup>

        <InputGroup>
          <Label>Account Type</Label>
          <RadioWrap>
            <RadioOption>
              <input
                type="radio"
                name="account_type"
                value="xpayz"
                checked={formData.account_type === "xpayz"}
                onChange={handleChange}
              />
              XPayz
            </RadioOption>
            <RadioOption>
              <input
                type="radio"
                name="account_type"
                value="cross"
                checked={formData.account_type === "cross"}
                onChange={handleChange}
              />
              Cross
            </RadioOption>
          </RadioWrap>
        </InputGroup>

        {formData.account_type === "xpayz" && (
          <InputGroup>
            <Label>Subaccount Number (ID)</Label>
            <Input
              name="subaccount_number"
              value={formData.subaccount_number}
              onChange={handleChange}
              placeholder="e.g., 110030"
              required
            />
          </InputGroup>
        )}

        {formData.account_type === "cross" && (
          <InputGroup>
            <Label>Chave PIX</Label>
            <Input
              name="chave_pix"
              value={formData.chave_pix}
              onChange={handleChange}
              placeholder="e.g., financeiro@cross.com"
              required
            />
          </InputGroup>
        )}

        <InputGroup>
          <Label>Assign to WhatsApp Group (Optional)</Label>
          <ComboBox
            options={[{ id: "", name: "None" }, ...(allGroups || [])]}
            value={formData.assigned_group_jid}
            onChange={(event) =>
              setFormData({ ...formData, assigned_group_jid: event.target.value })
            }
            placeholder="Select a group to assign..."
          />
        </InputGroup>

        <FooterActions>
          <Button type="button" $variant="dark" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Save Changes</Button>
        </FooterActions>
      </ModalForm>
    </Modal>
  );
};

const CredentialsModal = ({ isOpen, onClose, credentials, onReset, loading }) => {
  if (!credentials) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="520px">
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          <ModalTitle>Credentials for {credentials.subaccountName}</ModalTitle>
          <InlineBox>
            <strong>Username:</strong> {credentials.username}
          </InlineBox>

          <CredentialCard>
            <h4>Full Access (Master)</h4>
            <p>
              Password: <strong>{credentials.masterPassword}</strong>
            </p>
            <Button
              type="button"
              $variant="danger"
              style={{ marginTop: "0.55rem", width: "100%", justifyContent: "center" }}
              onClick={() => onReset(credentials.subaccountId, "master")}
            >
              Reset Master Password
            </Button>
          </CredentialCard>

          <CredentialCard>
            <h4>View-Only Access</h4>
            <p>
              Password: <strong>{credentials.viewOnlyPassword}</strong>
            </p>
            <Button
              type="button"
              $variant="danger"
              style={{ marginTop: "0.55rem", width: "100%", justifyContent: "center" }}
              onClick={() => onReset(credentials.subaccountId, "view_only")}
            >
              Reset View-Only Password
            </Button>
          </CredentialCard>

          <HelperText>
            If a password appears masked, reset it to generate and reveal a new one.
          </HelperText>
        </>
      )}
    </Modal>
  );
};

const RecibosModal = ({
  isOpen,
  onClose,
  subaccounts,
  loading,
  transactions,
  pagination,
  filters,
  onSelectAccount,
  onFiltersChange,
  selectedAccountId,
  onPageChange,
  onPageSizeChange,
  onReassign,
}) => {
  const theme = useTheme();
  const subOptions = useMemo(
    () =>
      subaccounts
        .filter((s) => s.account_type === "xpayz")
        .map((s) => ({ value: s.subaccount_number, label: s.name })),
    [subaccounts],
  );
  const selectedSourceOption = subOptions.find((option) => String(option.value) === String(selectedAccountId)) || null;

  const themedStyles = useMemo(
    () => ({
      ...modalSelectStyles,
      control: (base) => ({
        ...base,
        minHeight: 32,
        background: theme.surface,
        borderColor: theme.border,
      }),
      menu: (base) => ({
        ...base,
        background: theme.surface,
        border: `1px solid ${theme.border}`,
      }),
      option: (base, state) => ({
        ...base,
        background: state.isFocused ? theme.surfaceAlt : theme.surface,
        color: theme.text,
      }),
      singleValue: (base) => ({ ...base, color: theme.text }),
      input: (base) => ({ ...base, color: theme.text }),
    }),
    [theme],
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="980px">
      <ModalTitle>Recibos / Internal Transfer Manager</ModalTitle>
      <HelperText style={{ marginBottom: "0.75rem" }}>
        Select the source account, narrow the candidate list, and move transactions to the correct destination client faster.
      </HelperText>

      <InputGroup style={{ marginBottom: "0.72rem" }}>
        <Label>Select Source Account (Recibos)</Label>
        <Select
          options={subOptions}
          value={subOptions.find((option) => String(option.value) === String(selectedAccountId)) || null}
          onChange={(opt) => onSelectAccount(opt?.value)}
          placeholder="Choose account to inspect..."
          styles={themedStyles}
          menuPortalTarget={document.body}
        />
      </InputGroup>

      {selectedAccountId && (
        <>
          <RecibosSummaryGrid>
            <RecibosSummaryCard>
              <strong>Source Account</strong>
              <span>{selectedSourceOption?.label || selectedAccountId}</span>
            </RecibosSummaryCard>
            <RecibosSummaryCard>
              <strong>Visible Candidates</strong>
              <span>{pagination.totalRecords || 0}</span>
            </RecibosSummaryCard>
            <RecibosSummaryCard>
              <strong>Current Page</strong>
              <span>{pagination.currentPage || 1} / {pagination.totalPages || 1}</span>
            </RecibosSummaryCard>
          </RecibosSummaryGrid>

          <RecibosFiltersGrid>
            <InputGroup>
              <Label>Filter Possible Destination</Label>
              <Select
                options={[{ value: "", label: "All suggested destinations" }, ...subOptions]}
                value={[{ value: "", label: "All suggested destinations" }, ...subOptions].find((option) => String(option.value) === String(filters.targetSubaccountNumber || "")) || null}
                onChange={(opt) => onFiltersChange({ targetSubaccountNumber: opt?.value || "" })}
                placeholder="Filter Mazda, etc..."
                styles={themedStyles}
                menuPortalTarget={document.body}
              />
            </InputGroup>
            <InputGroup>
              <Label>Search Sender</Label>
              <Input
                value={filters.search || ""}
                onChange={(event) => onFiltersChange({ search: event.target.value })}
                placeholder="Search sender name..."
              />
            </InputGroup>
            <InputGroup>
              <Label>Exact Amount</Label>
              <Input
                value={filters.amountExact || ""}
                onChange={(event) => onFiltersChange({ amountExact: event.target.value })}
                placeholder="e.g. 7450.00"
                inputMode="decimal"
              />
            </InputGroup>
          </RecibosFiltersGrid>

          <RecibosToolbar>
            <RecibosMeta>
              Showing {transactions.length} row(s) on this page out of {pagination.totalRecords || 0} filtered records
            </RecibosMeta>
            <RecibosControls>
              <RecibosMeta>Rows</RecibosMeta>
              <RecibosPageSize
                value={String(pagination.limit ?? 50)}
                onChange={(event) => onPageSizeChange(event.target.value === "all" ? "all" : Number(event.target.value))}
              >
                <option value="20">20</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
                <option value="all">All</option>
              </RecibosPageSize>
            </RecibosControls>
          </RecibosToolbar>

          <RecibosTableWrap>
            {loading && transactions.length === 0 ? (
              <p style={{ padding: "0.8rem" }}>Loading transactions...</p>
            ) : (
              <RecibosTable>
                <thead>
                  <tr>
                    <th>Date / Time</th>
                    <th>Sender</th>
                    <th>Amount</th>
                    <th>Smart Suggestion</th>
                    <th>Assign To</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.length === 0 ? (
                    <tr>
                      <td colSpan="5">No transactions found.</td>
                    </tr>
                  ) : (
                    transactions.map((tx) => (
                      <RecibosRow key={tx.id} tx={tx} subOptions={subOptions} onReassign={onReassign} selectStyles={themedStyles} />
                    ))
                  )}
                </tbody>
              </RecibosTable>
            )}
          </RecibosTableWrap>

          <FooterActions style={{ marginTop: "0.6rem" }}>
            <div style={{ width: "100%" }}>
              <Pagination
                pagination={pagination}
                setPagination={(updater) => {
                  const next = typeof updater === "function" ? updater(pagination) : updater;
                  onPageChange(next.page || next.currentPage || 1);
                }}
              />
            </div>
          </FooterActions>
        </>
      )}
    </Modal>
  );
};

const RecibosRow = ({ tx, subOptions, onReassign, selectStyles }) => {
  const [target, setTarget] = useState(null);

  const suggestionOption = tx.suggestion
    ? subOptions.find((option) => String(option.value) === String(tx.suggestion.subaccountNumber))
    : null;

  return (
    <tr>
      <td>{new Date(tx.transaction_date).toLocaleString()}</td>
      <td>{tx.sender_name}</td>
      <td>{parseFloat(tx.amount).toFixed(2)}</td>
      <td>
        {tx.suggestion ? (
          <SuggestionBadge type="button" onClick={() => setTarget(suggestionOption)}>
            <FaMagic /> {tx.suggestion.subaccountName} ({tx.suggestion.matchCount || 0})
          </SuggestionBadge>
        ) : (
          <EmptyText>No history</EmptyText>
        )}
      </td>
      <td>
        <AssignCell>
          <div className="select">
            <Select
              options={subOptions}
              value={target}
              onChange={setTarget}
              placeholder="Select client..."
              menuPortalTarget={document.body}
              styles={selectStyles}
            />
          </div>
          <Button
            type="button"
            disabled={!target}
            onClick={() => onReassign(tx.id, target.value)}
            style={{ minWidth: "58px", justifyContent: "center" }}
          >
            Move
          </Button>
        </AssignCell>
      </td>
    </tr>
  );
};

const makeProfileEntryForm = () => ({
  label: "",
  account_holder_name: "",
  institution_name: "",
  pix_key: "",
  pix_copy_code: "",
  sort_order: "0",
  is_active: true,
});

const SubaccountProfileModal = ({ isOpen, onClose, subaccount }) => {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [form, setForm] = useState(makeProfileEntryForm());

  const loadEntries = useCallback(async () => {
    if (!subaccount?.id || !isOpen) return;
    setLoading(true);
    try {
      const { data } = await getSubaccountProfileEntries(subaccount.id);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
    } catch (_error) {
      alert("Failed to fetch profile entries.");
    } finally {
      setLoading(false);
    }
  }, [isOpen, subaccount?.id]);

  useEffect(() => {
    if (!isOpen) return;
    setEditingEntryId(null);
    setForm(makeProfileEntryForm());
    loadEntries();
  }, [isOpen, loadEntries]);

  const startEdit = (entry) => {
    setEditingEntryId(entry.id);
    setForm({
      label: entry.label || "",
      account_holder_name: entry.account_holder_name || "",
      institution_name: entry.institution_name || "",
      pix_key: entry.pix_key || "",
      pix_copy_code: entry.pix_copy_code || "",
      sort_order: String(entry.sort_order ?? 0),
      is_active: Boolean(entry.is_active),
    });
  };

  const resetEditor = () => {
    setEditingEntryId(null);
    setForm(makeProfileEntryForm());
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (!subaccount?.id) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        sort_order: Number(form.sort_order || 0),
        is_active: Boolean(form.is_active),
      };
      if (editingEntryId) {
        await updateSubaccountProfileEntry(subaccount.id, editingEntryId, payload);
      } else {
        await createSubaccountProfileEntry(subaccount.id, payload);
      }
      resetEditor();
      loadEntries();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to save profile entry.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (entry) => {
    if (!subaccount?.id) return;
    if (!window.confirm(`Delete profile entry "${entry.label || entry.institution_name}"?`)) return;
    try {
      await deleteSubaccountProfileEntry(subaccount.id, entry.id);
      if (editingEntryId === entry.id) {
        resetEditor();
      }
      loadEntries();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to delete profile entry.");
    }
  };

  const copyText = async (value, successLabel) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      alert(`${successLabel} copied.`);
    } catch (_error) {
      alert("Failed to copy.");
    }
  };

  if (!subaccount) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="1180px">
      <ModalTitle>Portal Profile for {subaccount.name}</ModalTitle>
      <HelperText style={{ marginBottom: "0.7rem" }}>
        Add one or more payment profiles for this client. XPayz profiles can also include a PIX copia-e-cola value for QR display in the portal.
      </HelperText>

      <ProfileModalLayout>
        <ProfilePanel>
          <ProfilePanelTitle>Saved Entries</ProfilePanelTitle>
          <ProfileEntriesList>
            {loading ? (
              <InlineBox>Loading profile entries...</InlineBox>
            ) : entries.length === 0 ? (
              <InlineBox>No profile entries yet.</InlineBox>
            ) : (
              entries.map((entry) => (
                <ProfileEntryCard key={entry.id}>
                  <ProfileEntryTop>
                    <div>
                      <strong>{entry.label || entry.institution_name}</strong>
                      <HelperText>{entry.account_holder_name}</HelperText>
                    </div>
                    <ActionIcons>
                      <IconButton type="button" onClick={() => startEdit(entry)} title="Edit Entry">
                        <FaEdit />
                      </IconButton>
                      <IconButton type="button" onClick={() => handleDeleteEntry(entry)} title="Delete Entry">
                        <FaTrash />
                      </IconButton>
                    </ActionIcons>
                  </ProfileEntryTop>

                  <ProfileEntryMeta>
                    <ProfileMetaChip>{entry.is_active ? "Active" : "Inactive"}</ProfileMetaChip>
                    <ProfileMetaChip>Sort {entry.sort_order ?? 0}</ProfileMetaChip>
                    {subaccount.account_type === "xpayz" && entry.pix_copy_code ? (
                      <ProfileMetaChip><FaQrcode /> QR Ready</ProfileMetaChip>
                    ) : null}
                  </ProfileEntryMeta>

                  <ProfileEntryFields>
                    <ProfileFieldRow>
                      <strong>Instituicao</strong>
                      <span>{entry.institution_name}</span>
                    </ProfileFieldRow>
                    <ProfileFieldRow>
                      <strong>Chave Pix</strong>
                      <span>{entry.pix_key}</span>
                    </ProfileFieldRow>
                  </ProfileEntryFields>

                  <ProfileCodeRow>
                    <code>{entry.pix_key}</code>
                    <Button type="button" $variant="dark" onClick={() => copyText(entry.pix_key, "PIX key")}>
                      <FaCopy /> Copy
                    </Button>
                  </ProfileCodeRow>

                  {subaccount.account_type === "xpayz" && entry.pix_copy_code ? (
                    <ProfileCodeRow>
                      <code>{entry.pix_copy_code}</code>
                      <Button type="button" $variant="dark" onClick={() => copyText(entry.pix_copy_code, "PIX code")}>
                        <FaCopy /> Copy QR Code
                      </Button>
                    </ProfileCodeRow>
                  ) : null}
                </ProfileEntryCard>
              ))
            )}
          </ProfileEntriesList>
        </ProfilePanel>

        <ProfilePanel as="form" onSubmit={handleSave}>
          <ProfilePanelTitle>{editingEntryId ? "Edit Entry" : "Add New Entry"}</ProfilePanelTitle>

          <InputGroup>
            <Label>Label / Bank Name (Optional)</Label>
            <Input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="e.g. Banco Principal"
            />
          </InputGroup>

          <InputGroup>
            <Label>Nome da Conta</Label>
            <Input
              value={form.account_holder_name}
              onChange={(event) => setForm((prev) => ({ ...prev, account_holder_name: event.target.value }))}
              placeholder="e.g. MAZDA LTDA"
              required
            />
          </InputGroup>

          <InputGroup>
            <Label>Nome da Instituicao</Label>
            <Input
              value={form.institution_name}
              onChange={(event) => setForm((prev) => ({ ...prev, institution_name: event.target.value }))}
              placeholder="e.g. Banco do Brasil"
              required
            />
          </InputGroup>

          <InputGroup>
            <Label>Chave PIX</Label>
            <Input
              value={form.pix_key}
              onChange={(event) => setForm((prev) => ({ ...prev, pix_key: event.target.value }))}
              placeholder="e.g. financeiro@empresa.com"
              required
            />
          </InputGroup>

          {subaccount.account_type === "xpayz" ? (
            <InputGroup>
              <Label>PIX Copia e Cola para QR (Optional)</Label>
              <LargeTextArea
                value={form.pix_copy_code}
                onChange={(event) => setForm((prev) => ({ ...prev, pix_copy_code: event.target.value }))}
                placeholder="Paste the PIX copia-e-cola string used for QR generation..."
              />
            </InputGroup>
          ) : null}

          <InputGroup>
            <Label>Sort Order</Label>
            <Input
              type="number"
              value={form.sort_order}
              onChange={(event) => setForm((prev) => ({ ...prev, sort_order: event.target.value }))}
            />
          </InputGroup>

          <RadioOption>
            <input
              type="checkbox"
              checked={Boolean(form.is_active)}
              onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
            />
            Active in portal
          </RadioOption>

          <FooterActions>
            {editingEntryId ? (
              <Button type="button" $variant="dark" onClick={resetEditor}>
                Cancel Edit
              </Button>
            ) : null}
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : editingEntryId ? "Update Entry" : "Add Entry"}
            </Button>
          </FooterActions>
        </ProfilePanel>
      </ProfileModalLayout>
    </Modal>
  );
};

const CrossDebitModal = ({ isOpen, onClose, subaccount, form, setForm, onSubmit }) => {
  if (!isOpen || !subaccount) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="520px">
      <ModalTitle>Add Debit (Cross)</ModalTitle>
      <HelperText style={{ marginBottom: "0.65rem" }}>
        Create a debit entry for <strong>{subaccount.name}</strong>.
      </HelperText>

      <ModalForm onSubmit={onSubmit}>
        <InputGroup>
          <Label>PIX Key</Label>
          <Input value={subaccount.chave_pix || ""} readOnly />
        </InputGroup>

        <InputGroup>
          <Label>Amount (BRL)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) => setForm((prev) => ({ ...prev, amount: event.target.value }))}
            placeholder="e.g., 134000.00"
            required
          />
        </InputGroup>

        <InputGroup>
          <Label>Date & Time</Label>
          <Input
            type="datetime-local"
            value={form.tx_date}
            onChange={(event) => setForm((prev) => ({ ...prev, tx_date: event.target.value }))}
            required
          />
        </InputGroup>

        <InputGroup>
          <Label>Description</Label>
          <Input
            value={form.description}
            onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
          />
        </InputGroup>

        <FooterActions>
          <Button type="button" $variant="dark" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">Create Debit</Button>
        </FooterActions>
      </ModalForm>
    </Modal>
  );
};

export default SubaccountsPage;
