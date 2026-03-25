import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import {
  FaArrowsAltH,
  FaCheck,
  FaCheckDouble,
  FaChevronDown,
  FaChevronUp,
  FaEdit,
  FaEye,
  FaEyeSlash,
  FaPlus,
  FaSave,
  FaSyncAlt,
  FaTimes,
  FaTrash,
} from "react-icons/fa";
import Modal from "../Modal";
import Pagination from "../Pagination";
import { usePortal } from "../../context/PortalContext";
import {
  claimPortalTrkbitTransaction,
  createPortalTransaction,
  deletePortalTransaction,
  getPortalDashboardSummary,
  getPortalTransactions,
  getPortalTrkbitTransactions,
  updatePortalTransaction,
  updatePortalTransactionBadge,
  updatePortalTransactionConfirmation,
  updatePortalTransactionNotes,
  updatePortalTransactionVisibility,
} from "../../services/api";

const useDebounce = (value, delay = 420) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeoutId = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timeoutId);
  }, [value, delay]);
  return debouncedValue;
};

const Page = styled.div`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;

const Surface = styled.section`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  box-shadow: ${({ theme }) => theme.shadowSm};
  border-radius: 18px;
`;

const Toolbar = styled(Surface)`
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;

  @media (max-width: 860px) {
    padding: 0.7rem;
    gap: 0.65rem;
  }
`;

const ToolbarHeader = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;

  @media (max-width: 860px) {
    gap: 0.55rem;
  }
`;

const ToolbarToggle = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.42rem;
  min-height: 38px;
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.primary};
  padding: 0.48rem 0.78rem;
  font-weight: 800;
  font-size: 0.84rem;
  cursor: pointer;
  flex-shrink: 0;

  @media (max-width: 860px) {
    min-height: 34px;
    padding: 0.4rem 0.65rem;
    font-size: 0.8rem;
  }
`;

const ToolbarBody = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.85rem;

  @media (max-width: 860px) {
    gap: 0.65rem;
  }
`;

const ToolbarTop = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.8rem;
  flex-wrap: wrap;

  @media (max-width: 860px) {
    gap: 0.55rem;
  }
`;

const TitleBlock = styled.div`
  min-width: 0;
  h2 {
    margin: 0 0 0.16rem;
    font-size: clamp(1.05rem, 1.7vw, 1.35rem);
    color: ${({ theme }) => theme.primary};
  }
  p {
    margin: 0;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.9rem;
  }

  @media (max-width: 860px) {
    h2 {
      margin-bottom: 0.08rem;
      font-size: 0.98rem;
      line-height: 1.2;
    }

    p {
      font-size: 0.78rem;
      line-height: 1.3;
    }
  }
`;

const Tabs = styled.div`
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.45rem;

  @media (max-width: 860px) {
    gap: 0.35rem;
  }
`;

const Tab = styled.button`
  border-radius: 999px;
  border: 1px solid ${({ theme, $active }) => ($active ? theme.secondary : theme.border)};
  background: ${({ theme, $active }) => ($active ? theme.secondarySoft : theme.surface)};
  color: ${({ theme, $active }) => ($active ? theme.primary : theme.lightText)};
  padding: 0.62rem 0.95rem;
  font-weight: 800;
  cursor: pointer;

  @media (max-width: 860px) {
    padding: 0.46rem 0.72rem;
    font-size: 0.82rem;
  }
`;

const FilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.7rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  @media (max-width: 860px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const FilterField = styled.label`
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-width: 0;
`;

const FilterLabel = styled.span`
  font-size: 0.74rem;
  font-weight: 800;
  color: ${({ theme }) => theme.lightText};
  text-transform: uppercase;
  letter-spacing: 0.04em;

  @media (max-width: 860px) {
    font-size: 0.66rem;
  }
`;

const Input = styled.input`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.7rem 0.82rem;
  width: 100%;
  min-width: 0;

  @media (max-width: 860px) {
    min-height: 36px;
    padding: 0.52rem 0.65rem;
    font-size: 0.86rem;
  }
`;

const Select = styled.select`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.7rem 0.82rem;
  width: 100%;

  @media (max-width: 860px) {
    min-height: 36px;
    padding: 0.52rem 0.65rem;
    font-size: 0.86rem;
  }
`;

const ActionsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.7rem;
  flex-wrap: wrap;

  @media (max-width: 860px) {
    gap: 0.5rem;
  }
`;

const ButtonCluster = styled.div`
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;

  @media (max-width: 860px) {
    gap: 0.4rem;
  }
`;

const Button = styled.button`
  min-height: 42px;
  border-radius: 10px;
  border: 1px solid ${({ theme, $variant }) => ($variant === "ghost" ? theme.border : theme.secondary)};
  background: ${({ theme, $variant }) => ($variant === "ghost" ? theme.surface : theme.secondary)};
  color: ${({ theme, $variant }) => ($variant === "ghost" ? theme.primary : "#fff")};
  padding: 0.7rem 0.9rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  cursor: pointer;

  @media (max-width: 860px) {
    min-height: 36px;
    padding: 0.52rem 0.72rem;
    font-size: 0.82rem;
    gap: 0.35rem;
  }
`;

const Metrics = styled.div`
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 0.6rem;

  @media (max-width: 1200px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 680px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.5rem;
  }
`;

const MetricCard = styled(Surface)`
  padding: 0.9rem 0.95rem;
  min-width: 0;
  h3 {
    margin: 0 0 0.22rem;
    font-size: 0.74rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: ${({ theme }) => theme.lightText};
  }
  p {
    margin: 0;
    font-size: clamp(0.98rem, 1.5vw, 1.28rem);
    font-weight: 800;
    color: ${({ theme, $tone }) => ($tone === "in" ? theme.success : $tone === "out" ? theme.error : theme.primary)};
    font-family: "Courier New", monospace;
  }
  span {
    display: block;
    margin-top: 0.18rem;
    font-size: 0.78rem;
    color: ${({ theme }) => theme.lightText};
  }

  @media (max-width: 860px) {
    padding: 0.62rem 0.72rem;

    h3 {
      font-size: 0.66rem;
      margin-bottom: 0.14rem;
    }

    p {
      font-size: 0.92rem;
      line-height: 1.15;
    }

    span {
      font-size: 0.7rem;
      margin-top: 0.08rem;
    }
  }
`;

const Panel = styled(Surface)`
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const TableWrap = styled.div`
  min-height: 0;
  flex: 1;
  overflow: auto;

  @media (max-width: 860px) {
    display: none;
  }
`;

const Table = styled.table`
  width: 100%;
  min-width: 1040px;
  border-collapse: collapse;
  font-size: 0.92rem;

  th,
  td {
    padding: 0.72rem 0.82rem;
    border-bottom: 1px solid ${({ theme }) => theme.border};
    vertical-align: top;
    text-align: left;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.lightText};
    font-size: 0.76rem;
  }
`;

const MobileList = styled.div`
  display: none;

  @media (max-width: 860px) {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
    min-height: 0;
    flex: 1;
    overflow: auto;
    padding: 0.65rem;
  }
`;

const MobileCard = styled(Surface)`
  padding: 0.92rem;
  display: flex;
  flex-direction: column;
  gap: 0.72rem;

  @media (max-width: 860px) {
    padding: 0.68rem;
    gap: 0.52rem;
    border-radius: 14px;
  }
`;

const Row = styled.div`
  display: flex;
  align-items: center;
  gap: 0.55rem;

  @media (max-width: 860px) {
    gap: 0.4rem;
  }
`;

const PartyCell = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.45rem;
  min-width: 0;
`;

const PartyContent = styled.div`
  min-width: 0;
  strong {
    display: block;
    color: ${({ theme }) => theme.text};
    word-break: break-word;
  }
  span {
    display: block;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.8rem;
    margin-top: 0.14rem;
  }
`;

const Badge = styled.button`
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.borderStrong};
  background: ${({ theme }) => theme.secondarySoft};
  color: ${({ theme }) => theme.primary};
  font-size: 0.72rem;
  font-weight: 800;
  padding: 0.2rem 0.55rem;
  white-space: nowrap;
  cursor: ${({ $editable }) => ($editable ? "pointer" : "default")};

  @media (max-width: 860px) {
    font-size: 0.66rem;
    padding: 0.16rem 0.45rem;
  }
`;

const TypeAmount = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  min-width: 130px;

  @media (max-width: 860px) {
    min-width: 0;
    gap: 0.12rem;
  }
`;

const TypePill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.34rem;
  width: fit-content;
  border-radius: 999px;
  padding: 0.26rem 0.55rem;
  font-size: 0.74rem;
  font-weight: 800;
  color: ${({ theme, $isIn }) => ($isIn ? theme.success : theme.error)};
  background: ${({ $isIn }) => ($isIn ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)")};

  @media (max-width: 860px) {
    font-size: 0.68rem;
    padding: 0.2rem 0.44rem;
  }
`;

const AmountText = styled.strong`
  color: ${({ theme, $isIn }) => ($isIn ? theme.success : theme.error)};
  font-size: 1rem;
  font-family: "Courier New", monospace;
`;

const StatusButton = styled.button`
  min-width: 116px;
  border-radius: 10px;
  border: 1px solid ${({ theme, $confirmed }) => ($confirmed ? theme.success : theme.borderStrong)};
  background: ${({ $confirmed }) => ($confirmed ? "rgba(16, 185, 129, 0.12)" : "rgba(251, 191, 36, 0.12)")};
  color: ${({ theme, $confirmed }) => ($confirmed ? theme.success : theme.primary)};
  padding: 0.55rem 0.72rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  font-weight: 800;
  cursor: pointer;
`;

const TinyAction = styled.button`
  border-radius: 999px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme, $active }) => ($active ? theme.secondarySoft : theme.surface)};
  color: ${({ theme }) => theme.primary};
  padding: 0.34rem 0.62rem;
  font-size: 0.74rem;
  font-weight: 800;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
`;

const ActionGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
`;

const Meta = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.8rem;
`;

const EmptyState = styled.div`
  padding: 2.8rem 1rem;
  text-align: center;
  color: ${({ theme }) => theme.lightText};
`;

const InlineNoteWrap = styled.div`
  min-width: 190px;
`;

const NoteTrigger = styled.button`
  width: 100%;
  border: 1px dashed ${({ theme }) => theme.borderStrong};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.text};
  border-radius: 10px;
  padding: 0.58rem 0.72rem;
  text-align: left;
  cursor: pointer;
  font-size: 0.86rem;
  line-height: 1.35;
`;

const NoteInput = styled.input`
  width: 100%;
  min-height: 38px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.secondary};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.55rem 0.7rem;
`;

const NoteActions = styled.div`
  display: flex;
  justify-content: flex-end;
  gap: 0.35rem;
  margin-top: 0.35rem;
`;

const ModalTitle = styled.h3`
  margin: 0 0 0.9rem;
  color: ${({ theme }) => theme.primary};
`;

const FormGrid = styled.div`
  display: grid;
  gap: 0.8rem;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
`;

const CheckboxField = styled.label`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.9rem;
  font-weight: 700;
  color: ${({ theme }) => theme.primary};
  cursor: pointer;

  input {
    width: 16px;
    height: 16px;
  }
`;

const TextArea = styled.textarea`
  width: 100%;
  min-height: 92px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surface};
  color: ${({ theme }) => theme.text};
  padding: 0.72rem 0.82rem;
  resize: vertical;
`;

const TransferFilterGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.65rem;
  margin: 0.9rem 0 1rem;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }
`;

const parseJwt = (token) => {
  try {
    const payload = token.split(".")[1] || "";
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + (4 - (base64.length % 4 || 4)), "=");
    return JSON.parse(atob(padded));
  } catch (_error) {
    return null;
  }
};

const getTodayDateInputValue = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "BRL" }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;
  return date.toLocaleString();
};

const makeInitialForm = () => ({
  transaction_date: new Date().toISOString().slice(0, 16),
  amount: "",
  operation_direct: "in",
  sender_name: "",
  counterparty_name: "",
  portal_notes: "",
  is_starting_entry: false,
  statementScope: "geral",
});

const PortalTransactionWorkspace = ({ forceViewOnly = false }) => {
  const { filters, setFilters } = usePortal();
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, currentPage: 1, totalPages: 1, totalRecords: 0, limit: 50 });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorForm, setEditorForm] = useState(makeInitialForm());
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [editingNoteKey, setEditingNoteKey] = useState(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferRows, setTransferRows] = useState([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferFilters, setTransferFilters] = useState({ search: "", amountExact: "", pixKey: "" });
  const [transferPixOptions, setTransferPixOptions] = useState([]);
  const [transferPagination, setTransferPagination] = useState({ page: 1, currentPage: 1, totalPages: 1, totalRecords: 0, limit: 20 });
  const [tokenPayload, setTokenPayload] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(() => (typeof window !== "undefined" ? window.innerWidth <= 860 : false));
  const [isToolbarExpanded, setIsToolbarExpanded] = useState(() => (typeof window !== "undefined" ? window.innerWidth > 860 : true));
  const latestFetchIdRef = useRef(0);
  const latestSummaryIdRef = useRef(0);
  const latestTransferFetchIdRef = useRef(0);

  useEffect(() => {
    const token = sessionStorage.getItem("portalAuthToken") || localStorage.getItem("portalAuthToken");
    setTokenPayload(parseJwt(token));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const syncViewportState = () => {
      setIsMobileViewport(window.innerWidth <= 860);
    };

    syncViewportState();
    window.addEventListener("resize", syncViewportState);
    return () => window.removeEventListener("resize", syncViewportState);
  }, []);

  const debouncedSearch = useDebounce(filters.search || "");
  const debouncedAmountExact = useDebounce(filters.amountExact || "");
  const debouncedTransferSearch = useDebounce(transferFilters.search || "");
  const debouncedTransferAmountExact = useDebounce(transferFilters.amountExact || "");
  const debouncedTransferPixKey = useDebounce(transferFilters.pixKey || "");
  const isImpersonating = tokenPayload?.impersonation === true || sessionStorage.getItem("portalImpersonation") === "true";
  const isViewOnly = forceViewOnly || tokenPayload?.accessLevel === "view_only";
  const isMasterView = !isImpersonating && !isViewOnly;
  const portalSourceType = summary?.sourceType || tokenPayload?.portalSourceType || "transactions";
  const isInvoicePortal = portalSourceType === "invoices";
  const currentStatementScope = summary?.statementScope || filters.statementScope || "geral";
  const currentStatementScopeLabel = currentStatementScope === "chave_pix" ? "Chave Pix" : "Geral";

  useEffect(() => {
    const today = getTodayDateInputValue();

    if (isViewOnly) {
      setFilters((prev) => {
        const next = {
          ...prev,
          pool: "statement",
          dateFrom: today,
          dateTo: "",
          direction: "in",
        };
        if (
          next.pool === prev.pool &&
          next.dateFrom === prev.dateFrom &&
          next.dateTo === prev.dateTo &&
          next.direction === prev.direction
        ) {
          return prev;
        }
        return next;
      });
      return;
    }

    if (isMasterView) {
      setFilters((prev) => (prev.dateTo ? { ...prev, dateTo: "" } : prev));
    }
  }, [isMasterView, isViewOnly, setFilters]);

  const effectiveFilters = useMemo(
    () => ({
      search: debouncedSearch,
      amountExact: debouncedAmountExact,
      dateFrom: isViewOnly ? getTodayDateInputValue() : filters.dateFrom || "",
      dateTo: isViewOnly ? "" : isImpersonating ? filters.dateTo || "" : "",
      direction: isViewOnly ? "in" : filters.direction || "",
      confirmation: filters.confirmation || "",
      pool: isViewOnly ? "statement" : filters.pool || "statement",
      statementScope: filters.statementScope || "geral",
    }),
    [
      debouncedAmountExact,
      debouncedSearch,
      filters.confirmation,
      filters.dateFrom,
      filters.dateTo,
      filters.direction,
      filters.pool,
      filters.statementScope,
      isImpersonating,
      isViewOnly,
    ],
  );

  const isTextFiltersDebouncing =
    (filters.search || "") !== debouncedSearch || (filters.amountExact || "") !== debouncedAmountExact;

  const canManageTransactions = isImpersonating;
  const activePool = isViewOnly ? "statement" : effectiveFilters.pool === "manual" ? "manual" : "statement";
  const accountType = tokenPayload?.accountType || "xpayz";
  const canManageActivePool = canManageTransactions && (!isInvoicePortal || activePool === "manual");
  const showTransfer = canManageTransactions && !isInvoicePortal && accountType === "cross" && activePool === "statement";
  const showToolbarBody = isToolbarExpanded;
  const showPoolTabs = !isViewOnly;
  const showDateFromFilter = !isViewOnly;
  const showDateToFilter = isImpersonating;
  const showDirectionFilter = !isViewOnly;
  const showMetrics = !isViewOnly;
  const showVisibilityControls = canManageTransactions && !isInvoicePortal;
  const statementLabel = isInvoicePortal ? "Recebidos" : "Chave Extrato";

  const updateFilters = (patch) => {
    setFilters((prev) => ({ ...prev, ...patch }));
    setPagination((prev) => ({ ...prev, page: 1, currentPage: 1 }));
  };

  const fetchTransactions = useCallback(async () => {
    if (isTextFiltersDebouncing) return;
    const fetchId = ++latestFetchIdRef.current;
    setLoading(true);
    try {
      const { data } = await getPortalTransactions({
        ...effectiveFilters,
        pool: activePool,
        page: pagination.currentPage || pagination.page || 1,
        limit: pagination.limit,
      });
      if (fetchId !== latestFetchIdRef.current) return;
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setPagination((prev) => ({
        ...prev,
        page: Number(data.currentPage || 1),
        currentPage: Number(data.currentPage || 1),
        totalPages: Math.max(Number(data.totalPages || 1), 1),
        totalRecords: Number(data.totalRecords || 0),
        limit: data.limit === "all" ? prev.limit : Number(data.limit || prev.limit || 50),
      }));
    } catch (error) {
      if (fetchId !== latestFetchIdRef.current) return;
      console.error("Failed to fetch portal transactions", error);
      setTransactions([]);
    } finally {
      if (fetchId !== latestFetchIdRef.current) return;
      setLoading(false);
    }
  }, [activePool, effectiveFilters, isTextFiltersDebouncing, pagination.currentPage, pagination.limit, pagination.page]);

  const fetchSummary = useCallback(async () => {
    if (isTextFiltersDebouncing) return;
    const fetchId = ++latestSummaryIdRef.current;
    try {
      const { data } = await getPortalDashboardSummary(effectiveFilters);
      if (fetchId !== latestSummaryIdRef.current) return;
      setSummary(data);
    } catch (error) {
      if (fetchId !== latestSummaryIdRef.current) return;
      console.error("Failed to fetch dashboard summary", error);
      setSummary(null);
    }
  }, [effectiveFilters, isTextFiltersDebouncing]);

  const fetchTransferRows = useCallback(async () => {
    if (!transferOpen) return;
    const fetchId = ++latestTransferFetchIdRef.current;
    setTransferLoading(true);
    try {
      const { data } = await getPortalTrkbitTransactions({
        page: transferPagination.currentPage || transferPagination.page || 1,
        limit: transferPagination.limit || 20,
        search: debouncedTransferSearch,
        amountExact: debouncedTransferAmountExact,
        pixKey: debouncedTransferPixKey,
      });
      if (fetchId !== latestTransferFetchIdRef.current) return;
      setTransferRows(Array.isArray(data.transactions) ? data.transactions : []);
      setTransferPixOptions(Array.isArray(data.pixOptions) ? data.pixOptions : []);
      setTransferPagination((prev) => ({
        ...prev,
        page: Number(data.currentPage || 1),
        currentPage: Number(data.currentPage || 1),
        totalPages: Math.max(Number(data.totalPages || 1), 1),
        totalRecords: Number(data.totalRecords || 0),
        limit: Number(data.limit || prev.limit || 20),
      }));
    } catch (error) {
      if (fetchId !== latestTransferFetchIdRef.current) return;
      console.error("Failed to fetch transfer rows", error);
      setTransferRows([]);
      setTransferPixOptions([]);
    } finally {
      if (fetchId !== latestTransferFetchIdRef.current) return;
      setTransferLoading(false);
    }
  }, [
    debouncedTransferAmountExact,
    debouncedTransferPixKey,
    debouncedTransferSearch,
    transferOpen,
    transferPagination.currentPage,
    transferPagination.limit,
    transferPagination.page,
  ]);

  useEffect(() => {
    if (!transferOpen) return;
    setTransferPagination((prev) => ({ ...prev, page: 1, currentPage: 1 }));
  }, [debouncedTransferAmountExact, debouncedTransferPixKey, debouncedTransferSearch, transferOpen]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  useEffect(() => {
    fetchTransferRows();
  }, [fetchTransferRows]);

  const metricCards = useMemo(() => {
    const data = summary || {};
    const cards = [
      { label: "Entradas", value: data.totalIn || 0, tone: "in", meta: `${Number(data.countIn || 0)} trans.` },
      { label: "Saidas", value: data.totalOut || 0, tone: "out", meta: `${Number(data.countOut || 0)} trans.` },
    ];

    if (activePool === "statement") {
      cards.push(
        { label: isInvoicePortal ? `Saldo ${currentStatementScopeLabel}` : "Saldo Chave", value: data.statementAllTimeBalance || 0, meta: "Total" },
        { label: "Saldo Total", value: data.allTimeBalance || 0, meta: "Total" },
      );
    } else {
      cards.push(
        { label: "Saldo Manual", value: data.manualBalance || 0, meta: "Filtrado" },
        { label: "Saldo Total", value: data.allTimeBalance || 0, meta: "Total" },
      );
    }

    return cards;
  }, [activePool, currentStatementScopeLabel, isInvoicePortal, summary]);

  const openCreate = () => {
    setEditingTransaction(null);
    setEditorForm({ ...makeInitialForm(), statementScope: currentStatementScope });
    setEditorOpen(true);
  };

  const openEdit = (transaction) => {
    setEditingTransaction(transaction);
    const transactionDate = transaction.transaction_date
      ? String(transaction.transaction_date).replace(" ", "T").slice(0, 16)
      : new Date().toISOString().slice(0, 16);
      setEditorForm({
        transaction_date: transactionDate,
        amount: transaction.amount,
        operation_direct: transaction.operation_direct || "in",
        sender_name: transaction.sender_name || "",
        counterparty_name: transaction.counterparty_name || "",
        portal_notes: transaction.portal_notes || "",
        is_starting_entry: Boolean(transaction.is_starting_entry),
        statementScope: transaction.statement_scope || currentStatementScope,
      });
    setEditorOpen(true);
  };

  const saveEditor = async (event) => {
    event.preventDefault();
    const payload = {
      ...editorForm,
      pool: activePool,
      statementScope: editorForm.statementScope || currentStatementScope,
    };
    if (editingTransaction) {
      await updatePortalTransaction(editingTransaction.id, payload);
    } else {
      await createPortalTransaction(payload);
    }
    setEditorOpen(false);
    fetchTransactions();
    fetchSummary();
  };

  const removeTransaction = async (transaction) => {
    const confirmed = window.confirm(
      activePool === "statement"
        ? "Hide this statement transaction?"
        : "Delete this manual transaction permanently?",
    );
    if (!confirmed) return;
    await deletePortalTransaction(transaction.id, activePool);
    fetchTransactions();
    fetchSummary();
  };

  const toggleAudience = async (transaction, audienceKey) => {
    await updatePortalTransactionVisibility({
      transactionId: transaction.id,
      pool: activePool,
      visibleInMaster: audienceKey === "master" ? !Boolean(transaction.visible_in_master) : undefined,
      visibleInViewOnly: audienceKey === "view_only" ? !Boolean(transaction.visible_in_view_only) : undefined,
    });
    fetchTransactions();
  };

  const handleBadgeEdit = async (transaction) => {
    if (isInvoicePortal) return;
    const nextLabel = window.prompt("Badge text", transaction.badge_label || "added");
    if (nextLabel == null) return;
    await updatePortalTransactionBadge({
      transactionId: transaction.id,
      pool: activePool,
      badgeLabel: nextLabel,
    });
    fetchTransactions();
  };

  const beginNoteEdit = (transaction) => {
    setEditingNoteKey(transaction.transaction_key);
    setNoteDraft(transaction.portal_notes || "");
  };

  const saveNote = async (transaction) => {
    await updatePortalTransactionNotes(transaction.id, transaction.source, noteDraft, activePool);
    setEditingNoteKey(null);
    setNoteDraft("");
    fetchTransactions();
  };

  const cancelNoteEdit = () => {
    setEditingNoteKey(null);
    setNoteDraft("");
  };

  const toggleConfirmation = async (transaction) => {
    const nextConfirmed = !Boolean(transaction.is_portal_confirmed);
    const passcode = nextConfirmed ? undefined : window.prompt("Unconfirm PIN");
    if (!nextConfirmed && passcode == null) return;
    await updatePortalTransactionConfirmation(transaction.id, transaction.source, nextConfirmed, passcode, activePool);
    fetchTransactions();
    fetchSummary();
  };

  const claimTransfer = async (row) => {
    await claimPortalTrkbitTransaction(row.id);
    fetchTransferRows();
    fetchTransactions();
    fetchSummary();
  };

  const renderTransferPixLabel = (pixKey) => {
    if (pixKey == null || String(pixKey).trim() === "") {
      return "Sem PIX";
    }
    return String(pixKey);
  };

  const renderNoteCell = (transaction) => {
    const isEditing = editingNoteKey === transaction.transaction_key;
    if (isEditing) {
      return (
        <InlineNoteWrap>
          <NoteInput
            value={noteDraft}
            onChange={(event) => setNoteDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                saveNote(transaction);
              }
              if (event.key === "Escape") {
                cancelNoteEdit();
              }
            }}
            autoFocus
          />
          <NoteActions>
            <TinyAction type="button" onClick={cancelNoteEdit}><FaTimes /> Cancel</TinyAction>
            <TinyAction type="button" $active onClick={() => saveNote(transaction)}><FaSave /> Save</TinyAction>
          </NoteActions>
        </InlineNoteWrap>
      );
    }

    return (
      <NoteTrigger type="button" onClick={() => beginNoteEdit(transaction)}>
        {transaction.portal_notes?.trim() ? transaction.portal_notes : "Add note..."}
      </NoteTrigger>
    );
  };

  const renderVisibilityActions = (transaction) => {
    if (!showVisibilityControls) return null;
    return (
      <ActionGroup>
        <TinyAction type="button" $active={Boolean(transaction.visible_in_master)} onClick={() => toggleAudience(transaction, "master")}>
          {transaction.visible_in_master ? <FaEye /> : <FaEyeSlash />} Master
        </TinyAction>
        <TinyAction type="button" $active={Boolean(transaction.visible_in_view_only)} onClick={() => toggleAudience(transaction, "view_only")}>
          {transaction.visible_in_view_only ? <FaEye /> : <FaEyeSlash />} View Only
        </TinyAction>
      </ActionGroup>
    );
  };

  const renderManageActions = (transaction) => {
    if (!canManageActivePool) return null;
    return (
      <ActionGroup>
        <TinyAction type="button" onClick={() => openEdit(transaction)}><FaEdit /> Edit</TinyAction>
        <TinyAction type="button" onClick={() => removeTransaction(transaction)}><FaTrash /> Delete</TinyAction>
      </ActionGroup>
    );
  };

  const renderPartyCell = (transaction) => {
    const partyLabel =
      transaction.operation_direct === "out"
        ? transaction.counterparty_name || "Unknown receiver"
        : transaction.sender_name || "Unknown sender";

    return (
      <PartyCell>
        {transaction.badge_label ? (
          <Badge type="button" $editable={canManageTransactions && !isInvoicePortal} onClick={() => canManageTransactions && !isInvoicePortal && handleBadgeEdit(transaction)}>
            {transaction.badge_label}
          </Badge>
        ) : null}
        <PartyContent>
          <strong>{partyLabel}</strong>
          <span>{formatDateTime(transaction.transaction_date)}</span>
        </PartyContent>
      </PartyCell>
    );
  };

  const renderTypeAmountCell = (transaction) => {
    const isIn =
      String(transaction.operation_direct || "").toLowerCase() === "in" ||
      String(transaction.operation_direct || "").toLowerCase() === "c";
    return (
      <TypeAmount>
        <TypePill $isIn={isIn}>
          {isIn ? <FaChevronDown /> : <FaChevronUp />}
          {isIn ? "IN" : "OUT"}
        </TypePill>
        <AmountText $isIn={isIn}>{formatMoney(transaction.amount)}</AmountText>
      </TypeAmount>
    );
  };

  return (
    <Page>
      <Toolbar>
        <ToolbarHeader>
          <TitleBlock>
            <h2>{activePool === "statement" ? statementLabel : "Manual"}</h2>
            {showToolbarBody ? (
              <p>
                {canManageTransactions
                  ? (isInvoicePortal
                    ? `Full impersonation can manage manual lancamentos, saldo inicial, notas e confirmacao para ${currentStatementScopeLabel}.`
                    : "Full impersonation can manage transactions, visibility, ownership, and badges.")
                  : "Notes and confirmation stay available in every portal view."}
              </p>
            ) : null}
          </TitleBlock>
          <ToolbarToggle type="button" onClick={() => setIsToolbarExpanded((prev) => !prev)}>
            {isToolbarExpanded ? <FaChevronUp /> : <FaChevronDown />}
            {isToolbarExpanded ? "Ocultar Painel" : "Mostrar Painel"}
          </ToolbarToggle>
        </ToolbarHeader>

        {showToolbarBody ? (
          <ToolbarBody>
            {showPoolTabs ? (
              <ToolbarTop>
                <div />
                <Tabs>
                  <Tab type="button" $active={activePool === "statement"} onClick={() => updateFilters({ pool: "statement" })}>
                    {statementLabel}
                  </Tab>
                  <Tab type="button" $active={activePool === "manual"} onClick={() => updateFilters({ pool: "manual" })}>
                    Manual
                  </Tab>
                </Tabs>
              </ToolbarTop>
            ) : null}

            {isInvoicePortal ? (
              <ToolbarTop>
                <div />
                <Tabs>
                  <Tab type="button" $active={currentStatementScope === "geral"} onClick={() => updateFilters({ statementScope: "geral" })}>
                    Geral
                  </Tab>
                  <Tab type="button" $active={currentStatementScope === "chave_pix"} onClick={() => updateFilters({ statementScope: "chave_pix" })}>
                    Chave Pix
                  </Tab>
                </Tabs>
              </ToolbarTop>
            ) : null}

            <FilterGrid>
              <FilterField>
                <FilterLabel>Nome</FilterLabel>
                <Input
                  placeholder="nome.."
                  value={filters.search || ""}
                  onChange={(event) => updateFilters({ search: event.target.value })}
                />
              </FilterField>
              <FilterField>
                <FilterLabel>Valor</FilterLabel>
                <Input
                  placeholder="valor"
                  inputMode="decimal"
                  value={filters.amountExact || ""}
                  onChange={(event) => updateFilters({ amountExact: event.target.value })}
                />
              </FilterField>
              {showDateFromFilter ? (
                <FilterField>
                  <FilterLabel>Data</FilterLabel>
                  <Input
                    type="date"
                    value={filters.dateFrom || ""}
                    onChange={(event) => updateFilters({ dateFrom: event.target.value })}
                  />
                </FilterField>
              ) : null}
              {showDateToFilter ? (
                <FilterField>
                  <FilterLabel>Data Ate</FilterLabel>
                  <Input
                    type="date"
                    value={filters.dateTo || ""}
                    onChange={(event) => updateFilters({ dateTo: event.target.value })}
                  />
                </FilterField>
              ) : null}
              {showDirectionFilter ? (
                <FilterField>
                  <FilterLabel>Tipo</FilterLabel>
                  <Select value={filters.direction || ""} onChange={(event) => updateFilters({ direction: event.target.value })}>
                    <option value="">IN / OUT</option>
                    <option value="in">IN</option>
                    <option value="out">OUT</option>
                  </Select>
                </FilterField>
              ) : null}
              <FilterField>
                <FilterLabel>Status</FilterLabel>
                <Select value={filters.confirmation || ""} onChange={(event) => updateFilters({ confirmation: event.target.value })}>
                  <option value="">Pending / Confirmed</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="pending">Pending</option>
                </Select>
              </FilterField>
            </FilterGrid>

            <ActionsRow>
              <Meta>{isTextFiltersDebouncing ? "Updating filters..." : `${pagination.totalRecords || 0} records`}</Meta>
              <ButtonCluster>
                <Button type="button" $variant="ghost" onClick={() => { fetchTransactions(); fetchSummary(); }}>
                  <FaSyncAlt /> Refresh
                </Button>
                {canManageActivePool ? (
                  <Button type="button" onClick={openCreate}>
                    <FaPlus /> Add
                  </Button>
                ) : null}
                {showTransfer ? (
                  <Button type="button" $variant="ghost" onClick={() => setTransferOpen(true)}>
                    <FaArrowsAltH /> Transfer Ownership
                  </Button>
                ) : null}
              </ButtonCluster>
            </ActionsRow>
          </ToolbarBody>
        ) : null}
      </Toolbar>

      {showMetrics ? (
        <Metrics>
          {metricCards.map((card) => (
            <MetricCard key={card.label} $tone={card.tone}>
              <h3>{card.label}</h3>
              <p>{formatMoney(card.value)}</p>
              <span>{card.meta}</span>
            </MetricCard>
          ))}
        </Metrics>
      ) : null}

      <Panel>
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>Nome e Data</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Notes</th>
                {showVisibilityControls ? <th>Visibility</th> : null}
                {canManageActivePool ? <th>Manage</th> : null}
              </tr>
            </thead>
            <tbody>
              {!loading && transactions.length === 0 ? (
                <tr>
                  <td colSpan={(showVisibilityControls ? 1 : 0) + (canManageActivePool ? 1 : 0) + 4}>
                    <EmptyState>No transactions found.</EmptyState>
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.transaction_key}>
                    <td>{renderPartyCell(transaction)}</td>
                    <td>{renderTypeAmountCell(transaction)}</td>
                    <td>
                      <StatusButton
                        type="button"
                        $confirmed={Boolean(transaction.is_portal_confirmed)}
                        onClick={() => toggleConfirmation(transaction)}
                      >
                        {transaction.is_portal_confirmed ? <FaCheckDouble /> : <FaCheck />}
                        {transaction.is_portal_confirmed ? "Confirmed" : "Pending"}
                      </StatusButton>
                    </td>
                    <td>{renderNoteCell(transaction)}</td>
                    {showVisibilityControls ? <td>{renderVisibilityActions(transaction)}</td> : null}
                    {canManageActivePool ? <td>{renderManageActions(transaction)}</td> : null}
                  </tr>
                ))
              )}
            </tbody>
          </Table>
        </TableWrap>

        <MobileList>
          {!loading && transactions.length === 0 ? (
            <EmptyState>No transactions found.</EmptyState>
          ) : (
            transactions.map((transaction) => (
              <MobileCard key={transaction.transaction_key}>
                {renderPartyCell(transaction)}
                {renderTypeAmountCell(transaction)}
                <StatusButton
                  type="button"
                  $confirmed={Boolean(transaction.is_portal_confirmed)}
                  onClick={() => toggleConfirmation(transaction)}
                >
                  {transaction.is_portal_confirmed ? <FaCheckDouble /> : <FaCheck />}
                  {transaction.is_portal_confirmed ? "Confirmed" : "Pending"}
                </StatusButton>
                {renderNoteCell(transaction)}
                {showVisibilityControls ? renderVisibilityActions(transaction) : null}
                {canManageActivePool ? renderManageActions(transaction) : null}
              </MobileCard>
            ))
          )}
        </MobileList>

        <div style={{ padding: "0.8rem 1rem" }}>
          <Pagination pagination={pagination} setPagination={setPagination} />
        </div>
      </Panel>

      <Modal isOpen={editorOpen} onClose={() => setEditorOpen(false)} maxWidth="760px">
        <ModalTitle>{editingTransaction ? "Editar Transacao" : `Adicionar Transacao ${activePool === "statement" ? statementLabel : "Manual"}`}</ModalTitle>
        <form onSubmit={saveEditor}>
          <FormGrid>
            <Input type="datetime-local" value={editorForm.transaction_date} onChange={(event) => setEditorForm((prev) => ({ ...prev, transaction_date: event.target.value }))} />
            <Input type="number" step="0.01" placeholder="Valor" value={editorForm.amount} onChange={(event) => setEditorForm((prev) => ({ ...prev, amount: event.target.value }))} />
            <Select value={editorForm.operation_direct} onChange={(event) => setEditorForm((prev) => ({ ...prev, operation_direct: event.target.value }))}>
              <option value="in">IN</option>
              <option value="out">OUT</option>
            </Select>
            <Input placeholder="Sender name" value={editorForm.sender_name} onChange={(event) => setEditorForm((prev) => ({ ...prev, sender_name: event.target.value }))} />
            <Input placeholder="Nome" value={editorForm.counterparty_name} onChange={(event) => setEditorForm((prev) => ({ ...prev, counterparty_name: event.target.value }))} />
          </FormGrid>
          {isInvoicePortal && activePool === "manual" ? (
            <>
              <CheckboxField>
                <input
                  type="checkbox"
                  checked={Boolean(editorForm.is_starting_entry)}
                  onChange={(event) => setEditorForm((prev) => ({ ...prev, is_starting_entry: event.target.checked }))}
                />
                Definir como saldo inicial
              </CheckboxField>
              {editorForm.is_starting_entry ? (
                <div style={{ marginTop: "0.8rem" }}>
                  <Select
                    value={editorForm.statementScope || currentStatementScope}
                    onChange={(event) => setEditorForm((prev) => ({ ...prev, statementScope: event.target.value }))}
                  >
                    <option value="geral">Saldo Inicial Geral</option>
                    <option value="chave_pix">Saldo Inicial Chave Pix</option>
                  </Select>
                </div>
              ) : null}
            </>
          ) : null}
          <div style={{ marginTop: "0.8rem" }}>
            <TextArea placeholder="Optional note" value={editorForm.portal_notes} onChange={(event) => setEditorForm((prev) => ({ ...prev, portal_notes: event.target.value }))} />
          </div>
          <ActionGroup style={{ justifyContent: "flex-end", marginTop: "1rem" }}>
            <Button type="button" $variant="ghost" onClick={() => setEditorOpen(false)}>Cancel</Button>
            <Button type="submit"><FaSave /> Save</Button>
          </ActionGroup>
        </form>
      </Modal>

      <Modal isOpen={transferOpen} onClose={() => setTransferOpen(false)} maxWidth="980px">
        <ModalTitle>Transfer Ownership</ModalTitle>
        <Meta>Pesquise por nome, valor exato ou chave PIX de origem e mova a transacao para ca com o badge editavel.</Meta>

        <TransferFilterGrid>
          <Input placeholder="nome.." value={transferFilters.search} onChange={(event) => setTransferFilters((prev) => ({ ...prev, search: event.target.value }))} />
          <Input placeholder="valor" inputMode="decimal" value={transferFilters.amountExact} onChange={(event) => setTransferFilters((prev) => ({ ...prev, amountExact: event.target.value }))} />
          <Select value={transferFilters.pixKey} onChange={(event) => setTransferFilters((prev) => ({ ...prev, pixKey: event.target.value }))}>
            <option value="">Todos os PIX</option>
            <option value="__EMPTY__">Sem PIX</option>
            {transferPixOptions
              .filter((pixKey) => String(pixKey || "").trim() !== "")
              .map((pixKey) => (
                <option key={pixKey} value={pixKey}>
                  {pixKey}
                </option>
              ))}
          </Select>
        </TransferFilterGrid>

        <div style={{ display: "grid", gap: "0.7rem", maxHeight: "56vh", overflow: "auto" }}>
          {transferLoading ? (
            <Meta>Loading transfer candidates...</Meta>
          ) : transferRows.length === 0 ? (
            <EmptyState>No transactions match these transfer filters.</EmptyState>
          ) : (
            transferRows.map((row) => (
              <MobileCard key={row.id}>
                <Row style={{ justifyContent: "space-between" }}>
                  <strong>{row.tx_payer_name || "Unknown"}</strong>
                  <AmountText $isIn={row.tx_type === "C"}>{formatMoney(row.amount)}</AmountText>
                </Row>
                <Meta>{formatDateTime(row.transaction_date)}</Meta>
                <Meta>PIX: {renderTransferPixLabel(row.tx_pix_key)}</Meta>
                <Button type="button" onClick={() => claimTransfer(row)}>
                  <FaCheck /> Take Ownership
                </Button>
              </MobileCard>
            ))
          )}
        </div>
        <div style={{ marginTop: "0.85rem" }}>
          <Pagination pagination={transferPagination} setPagination={setTransferPagination} />
        </div>
      </Modal>
    </Page>
  );
};

export default PortalTransactionWorkspace;
