import React, { useEffect, useState } from "react";
import styled from "styled-components";
import api from "../services/api";
import { usePermissions } from "../context/PermissionContext";

const PageWrap = styled.div`
  height: 100%;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-right: 0.08rem;
`;

const Panel = styled.section`
  max-width: 980px;
  width: 100%;
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 12px;
  background: ${({ theme }) => theme.surface};
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 0.78rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
`;

const Heading = styled.div`
  h2 {
    margin: 0;
    font-size: 1.04rem;
  }

  p {
    margin: 0.24rem 0 0;
    font-size: 0.79rem;
    color: ${({ theme }) => theme.lightText};
  }
`;

const Section = styled.div`
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 10px;
  background: ${({ theme }) => theme.surfaceAlt};
  padding: 0.62rem;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.55rem;
  align-items: start;

  @media (max-width: 760px) {
    grid-template-columns: 1fr;
  }
`;

const SectionText = styled.div`
  min-width: 0;

  strong {
    display: block;
    font-size: 0.82rem;
    margin-bottom: 0.14rem;
  }

  span {
    display: block;
    color: ${({ theme }) => theme.lightText};
    font-size: 0.76rem;
    line-height: 1.45;
  }
`;

const SwitchWrap = styled.label`
  position: relative;
  width: 44px;
  height: 24px;
  display: inline-block;
`;

const SwitchInput = styled.input`
  opacity: 0;
  width: 0;
  height: 0;

  &:checked + span {
    background: ${({ theme }) => theme.secondary};
  }

  &:checked + span::before {
    transform: translateX(20px);
  }

  &:disabled + span {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const Slider = styled.span`
  position: absolute;
  inset: 0;
  cursor: pointer;
  border-radius: 999px;
  background: ${({ theme }) => theme.borderStrong};
  transition: background 0.16s ease;

  &::before {
    content: "";
    position: absolute;
    left: 3px;
    top: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: ${({ theme }) => theme.surface};
    transition: transform 0.16s ease;
  }
`;

const RadioGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.48rem;

  @media (max-width: 620px) {
    grid-template-columns: 1fr;
  }
`;

const RadioCard = styled.label`
  border: 1px solid
    ${({ theme, $active }) => ($active ? theme.secondary : theme.border)};
  border-radius: 10px;
  background: ${({ theme, $active }) => ($active ? theme.secondarySoft : theme.surface)};
  padding: 0.58rem;
  display: flex;
  align-items: center;
  gap: 0.52rem;
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 700;
`;

const InlineHint = styled.span`
  color: ${({ theme }) => theme.lightText};
  font-size: 0.75rem;
  font-weight: 500;
`;

const AutoConfirmationPage = () => {
  const { hasPermission } = usePermissions();
  const canEdit = hasPermission("settings:toggle_confirmations");

  const [isAutoConfEnabled, setIsAutoConfEnabled] = useState(false);
  const [isAlfaApiEnabled, setIsAlfaApiEnabled] = useState(false);
  const [trocaCoinMethod, setTrocaCoinMethod] = useState("telegram");
  const [isTrkbitEnabled, setIsTrkbitEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllStatuses = async () => {
      try {
        const [autoConfRes, alfaApiRes, trkbitRes, trocaCoinRes] = await Promise.all([
          api.get("/settings/auto-confirmation"),
          api.get("/settings/alfa-api-confirmation"),
          api.get("/settings/trkbit-confirmation"),
          api.get("/settings/troca-coin-method"),
        ]);
        setIsAutoConfEnabled(!!autoConfRes.data.isEnabled);
        setIsAlfaApiEnabled(!!alfaApiRes.data.isEnabled);
        setIsTrkbitEnabled(!!trkbitRes.data.isEnabled);
        setTrocaCoinMethod(trocaCoinRes.data.method || "telegram");
      } catch (error) {
        console.error("Failed to fetch statuses:", error);
        alert("Could not load confirmation settings.");
      } finally {
        setLoading(false);
      }
    };
    fetchAllStatuses();
  }, []);

  const postToggle = async (endpoint, stateSetter, currentValue, errorMessage) => {
    const nextValue = !currentValue;
    stateSetter(nextValue);
    try {
      await api.post(endpoint, { isEnabled: nextValue });
    } catch (_error) {
      stateSetter(currentValue);
      alert(errorMessage);
    }
  };

  const handleTrocaCoinMethodChange = async (event) => {
    const nextMethod = event.target.value;
    const previous = trocaCoinMethod;
    setTrocaCoinMethod(nextMethod);
    try {
      await api.post("/settings/troca-coin-method", { method: nextMethod });
    } catch (_error) {
      setTrocaCoinMethod(previous);
      alert("Failed to update Troca Coin method.");
    }
  };

  if (loading) return <p>Loading settings...</p>;

  return (
    <PageWrap>
      <Panel>
        <Heading>
          <h2>Confirmation Settings</h2>
          <p>Control automation rules for broadcast confirmations and finance checks.</p>
        </Heading>

        <Section>
          <SectionText>
            <strong>Standard Auto-Confirmation</strong>
            <span>
              Adds a yellow reaction on forwarded messages; a thumbs-up in destination can trigger
              automatic "Caiu" in origin.
            </span>
          </SectionText>
          <SwitchWrap>
            <SwitchInput
              type="checkbox"
              checked={isAutoConfEnabled}
              onChange={() =>
                postToggle(
                  "/settings/auto-confirmation",
                  setIsAutoConfEnabled,
                  isAutoConfEnabled,
                  "Failed to update standard auto-confirmation.",
                )
              }
              disabled={!canEdit}
            />
            <Slider />
          </SwitchWrap>
        </Section>

        <Section>
          <SectionText>
            <strong>Trkbit / Cross API Confirmation</strong>
            <span>
              Verifies Trkbit, BrasilCash, and Cross Intermediacao-related invoices against synced
              API transaction data.
            </span>
          </SectionText>
          <SwitchWrap>
            <SwitchInput
              type="checkbox"
              checked={isTrkbitEnabled}
              onChange={() =>
                postToggle(
                  "/settings/trkbit-confirmation",
                  setIsTrkbitEnabled,
                  isTrkbitEnabled,
                  "Failed to update Trkbit confirmation setting.",
                )
              }
              disabled={!canEdit}
            />
            <Slider />
          </SwitchWrap>
        </Section>

        <Section>
          <SectionText>
            <strong>Alfa Trust API Confirmation</strong>
            <span>
              Checks Alfa Trust invoices through API and applies status reactions for success and
              not-found outcomes.
            </span>
          </SectionText>
          <SwitchWrap>
            <SwitchInput
              type="checkbox"
              checked={isAlfaApiEnabled}
              onChange={() =>
                postToggle(
                  "/settings/alfa-api-confirmation",
                  setIsAlfaApiEnabled,
                  isAlfaApiEnabled,
                  "Failed to update Alfa API confirmation setting.",
                )
              }
              disabled={!canEdit}
            />
            <Slider />
          </SwitchWrap>
        </Section>

        <Section>
          <SectionText>
            <strong>Troca Coin / MKS Confirmation Source</strong>
            <span>Choose which backend source is used when confirming Troca Coin or MKS requests.</span>
          </SectionText>
          <RadioGrid>
            <RadioCard $active={trocaCoinMethod === "telegram"}>
              <input
                type="radio"
                value="telegram"
                checked={trocaCoinMethod === "telegram"}
                onChange={handleTrocaCoinMethodChange}
                disabled={!canEdit}
              />
              Telegram Listener
            </RadioCard>
            <RadioCard $active={trocaCoinMethod === "xpayz"}>
              <input
                type="radio"
                value="xpayz"
                checked={trocaCoinMethod === "xpayz"}
                onChange={handleTrocaCoinMethodChange}
                disabled={!canEdit}
              />
              XPayz API
            </RadioCard>
          </RadioGrid>
          {!canEdit && <InlineHint>Read-only: missing permission `settings:toggle_confirmations`.</InlineHint>}
        </Section>
      </Panel>
    </PageWrap>
  );
};

export default AutoConfirmationPage;
