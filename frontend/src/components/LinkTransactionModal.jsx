import React, { useEffect, useState } from "react";
import styled from "styled-components";
import Modal from "./Modal";
import { confirmManualInvoice, getManualCandidates } from "../services/api";
import { format } from "date-fns";
import { FaLink } from "react-icons/fa";

const Intro = styled.p`
  margin: 0 0 0.6rem;
  font-size: 0.8rem;
`;

const ListContainer = styled.div`
  max-height: 420px;
  overflow: auto;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 8px;
`;

const TransactionItem = styled.div`
  padding: 0.52rem;
  border-bottom: 1px solid ${({ theme }) => theme.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.55rem;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: ${({ theme }) => theme.surfaceAlt};
  }
`;

const TransactionInfo = styled.div`
  min-width: 0;
  p {
    margin: 0;
    font-size: 0.8rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  strong {
    color: ${({ theme }) => theme.primary};
  }

  small {
    color: ${({ theme }) => theme.lightText};
    font-size: 0.72rem;
  }
`;

const LinkButton = styled.button`
  border: 1px solid transparent;
  border-radius: 7px;
  min-height: 28px;
  padding: 0.2rem 0.52rem;
  background: ${({ theme }) => theme.secondary};
  color: #fff;
  font-weight: 800;
  font-size: 0.74rem;
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
`;

const EmptyState = styled.p`
  margin: 0;
  padding: 0.7rem;
  font-size: 0.78rem;
  color: ${({ theme }) => theme.lightText};
  text-align: center;
`;

const LinkTransactionModal = ({ isOpen, onClose, invoice }) => {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !invoice) return;

    const fetchCandidates = async () => {
      setLoading(true);
      try {
        const amount = parseFloat(String(invoice.amount).replace(/,/g, ""));
        const { data } = await getManualCandidates(amount, invoice.recipient_name);
        setCandidates(data || []);
      } catch (error) {
        console.error("Failed to fetch candidate transactions:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCandidates();
  }, [isOpen, invoice]);

  const handleLink = async (transaction) => {
    if (
      !window.confirm(
        `Link this invoice to the ${transaction.source} transaction from \"${transaction.name}\"?`,
      )
    ) {
      return;
    }

    try {
      await confirmManualInvoice({
        messageId: invoice.message_id,
        linkedTransactionId: transaction.id,
        source: transaction.source,
      });
      onClose();
    } catch (error) {
      alert(error.response?.data?.message || "Failed to link invoice.");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} maxWidth="760px">
      <h2 style={{ margin: 0 }}>Link to Bank Transaction</h2>
      <Intro>
        Select an unused bank transaction to link with this invoice.
        <br />
        <strong>Amount:</strong> {invoice?.amount} | <strong>Recipient:</strong> {invoice?.recipient_name}
      </Intro>

      <ListContainer>
        {loading ? (
          <EmptyState>Loading...</EmptyState>
        ) : candidates.length === 0 ? (
          <EmptyState>No unused bank transactions found for this amount.</EmptyState>
        ) : (
          candidates.map((tx) => (
            <TransactionItem key={`${tx.source}-${tx.id}`}>
              <TransactionInfo>
                <p>
                  <strong>{tx.name}</strong> ({tx.source})
                </p>
                <small>{format(new Date(tx.date), "dd/MM/yyyy HH:mm")}</small>
              </TransactionInfo>
              <LinkButton type="button" onClick={() => handleLink(tx)}>
                <FaLink /> Link
              </LinkButton>
            </TransactionItem>
          ))
        )}
      </ListContainer>
    </Modal>
  );
};

export default LinkTransactionModal;
