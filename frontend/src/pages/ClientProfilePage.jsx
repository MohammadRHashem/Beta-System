import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { FaCopy, FaQrcode, FaUniversity, FaUser } from "react-icons/fa";
import Modal from "../components/Modal";
import { getPortalProfile } from "../services/api";

const Page = styled.div`
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
`;

const Hero = styled.section`
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1rem;
  align-items: center;
  padding: 1rem 1.1rem;
  background: linear-gradient(135deg, #0a2540, #143d66);
  color: #fff;
  border-radius: 18px;
  box-shadow: 0 12px 32px rgba(10, 37, 64, 0.18);

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
    text-align: center;
  }
`;

const Avatar = styled.div`
  width: 70px;
  height: 70px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 1.75rem;
  font-weight: 800;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.28);
`;

const HeroText = styled.div`
  h1 {
    margin: 0;
    font-size: clamp(1.2rem, 2vw, 1.8rem);
    letter-spacing: 0.04em;
  }

  p {
    margin: 0.32rem 0 0;
    color: rgba(255, 255, 255, 0.8);
  }
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 0.9rem;
`;

const Card = styled.section`
  background: ${({ theme }) => theme.surface};
  border: 1px solid ${({ theme }) => theme.border};
  border-radius: 18px;
  box-shadow: ${({ theme }) => theme.shadowSm};
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
`;

const CardTop = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 0.8rem;
  align-items: flex-start;
`;

const CardBadge = styled.span`
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.62rem;
  border-radius: 999px;
  background: ${({ theme }) => theme.secondarySoft};
  color: ${({ theme }) => theme.primary};
  font-size: 0.72rem;
  font-weight: 800;
`;

const FieldGrid = styled.div`
  display: grid;
  gap: 0.55rem;
`;

const FieldRow = styled.div`
  display: grid;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 0.6rem;
  align-items: start;

  strong {
    color: ${({ theme }) => theme.lightText};
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  span {
    color: ${({ theme }) => theme.text};
    word-break: break-word;
    font-weight: 600;
  }
`;

const PixRow = styled.div`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
`;

const PixCode = styled.code`
  flex: 1;
  min-width: 0;
  padding: 0.78rem 0.85rem;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  color: ${({ theme }) => theme.text};
  font-size: 0.8rem;
  word-break: break-all;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 0.55rem;
  flex-wrap: wrap;
`;

const ActionButton = styled.button`
  min-height: 40px;
  border-radius: 10px;
  border: 1px solid ${({ theme, $ghost }) => ($ghost ? theme.border : theme.secondary)};
  background: ${({ theme, $ghost }) => ($ghost ? theme.surface : theme.secondary)};
  color: ${({ theme, $ghost }) => ($ghost ? theme.primary : "#fff")};
  font-weight: 800;
  padding: 0.68rem 0.9rem;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
`;

const QrPreview = styled.button`
  border: 1px solid ${({ theme }) => theme.border};
  background: ${({ theme }) => theme.surfaceAlt};
  border-radius: 14px;
  padding: 0.6rem;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  img {
    width: 92px;
    height: 92px;
    object-fit: contain;
    display: block;
  }
`;

const EmptyState = styled.div`
  border: 1px dashed ${({ theme }) => theme.borderStrong};
  border-radius: 18px;
  padding: 2rem 1rem;
  text-align: center;
  color: ${({ theme }) => theme.lightText};
  background: ${({ theme }) => theme.surfaceAlt};
`;

const QrWrap = styled.div`
  display: grid;
  justify-items: center;
  gap: 0.8rem;
  text-align: center;

  img {
    width: 220px;
    height: 220px;
    object-fit: contain;
    border-radius: 14px;
    border: 1px solid ${({ theme }) => theme.border};
    background: #fff;
    padding: 0.6rem;
  }

  p {
    margin: 0;
    color: ${({ theme }) => theme.lightText};
  }
`;

const getQrImageUrl = (value) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(value)}`;

const ClientProfilePage = () => {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedQrEntry, setSelectedQrEntry] = useState(null);

  useEffect(() => {
    const loadProfile = async () => {
      setLoading(true);
      try {
        const { data } = await getPortalProfile();
        setProfile(data);
      } catch (_error) {
        setProfile(null);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  const uppercaseUsername = useMemo(
    () => String(profile?.subaccount?.username || "CLIENT").toUpperCase(),
    [profile?.subaccount?.username]
  );

  const avatarLetter = uppercaseUsername.charAt(0) || "C";
  const entries = Array.isArray(profile?.entries) ? profile.entries : [];
  const accountType = profile?.subaccount?.accountType || "xpayz";

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      alert(`${label} copiada.`);
    } catch (_error) {
      alert("Nao foi possivel copiar.");
    }
  };

  return (
    <Page>
      <Hero>
        <Avatar>{avatarLetter}</Avatar>
        <HeroText>
          <h1>{uppercaseUsername}</h1>
          <p>Perfil bancario e dados de envio por Pix.</p>
        </HeroText>
      </Hero>

      {loading ? (
        <EmptyState>Carregando perfil...</EmptyState>
      ) : entries.length === 0 ? (
        <EmptyState>Nenhum dado bancario cadastrado para este cliente ainda.</EmptyState>
      ) : (
        <CardsGrid>
          {entries.map((entry) => (
            <Card key={entry.id}>
              <CardTop>
                <div>
                  <strong>{entry.label || entry.institution_name}</strong>
                </div>
                <CardBadge>
                  <FaUniversity /> {accountType === "xpayz" ? "XPayz" : "Cross"}
                </CardBadge>
              </CardTop>

              <FieldGrid>
                <FieldRow>
                  <strong>Nome</strong>
                  <span>{entry.account_holder_name}</span>
                </FieldRow>
                <FieldRow>
                  <strong>Instituicao</strong>
                  <span>{entry.institution_name}</span>
                </FieldRow>
                <FieldRow>
                  <strong>Chave Pix</strong>
                  <span>{entry.pix_key}</span>
                </FieldRow>
              </FieldGrid>

              <PixRow>
                <PixCode>{entry.pix_key}</PixCode>
                <ActionButton type="button" onClick={() => copyText(entry.pix_key, "Chave Pix")}>
                  <FaCopy /> Copiar
                </ActionButton>
              </PixRow>

              <ButtonRow>
                {accountType === "xpayz" && entry.pix_copy_code ? (
                  <>
                    <QrPreview type="button" onClick={() => setSelectedQrEntry(entry)}>
                      <img src={getQrImageUrl(entry.pix_copy_code)} alt="QR Pix" />
                    </QrPreview>
                    <ActionButton type="button" $ghost onClick={() => setSelectedQrEntry(entry)}>
                      <FaQrcode /> Ver QR Code
                    </ActionButton>
                    <ActionButton type="button" $ghost onClick={() => copyText(entry.pix_copy_code, "Codigo Pix")}>
                      <FaCopy /> Copiar Codigo
                    </ActionButton>
                  </>
                ) : (
                  <CardBadge>
                    <FaUser /> Pix pronto para copiar
                  </CardBadge>
                )}
              </ButtonRow>
            </Card>
          ))}
        </CardsGrid>
      )}

      <Modal isOpen={Boolean(selectedQrEntry)} onClose={() => setSelectedQrEntry(null)} maxWidth="430px">
        {selectedQrEntry ? (
          <QrWrap>
            <h2 style={{ margin: 0 }}>QR Code</h2>
            <p>Escaneie o QR Code ou copie o codigo para pagar via Pix.</p>
            <img src={getQrImageUrl(selectedQrEntry.pix_copy_code)} alt="QR Pix ampliado" />
            <PixCode style={{ width: "100%" }}>{selectedQrEntry.pix_copy_code}</PixCode>
            <ActionButton type="button" onClick={() => copyText(selectedQrEntry.pix_copy_code, "Codigo Pix")}>
              <FaCopy /> Copiar codigo
            </ActionButton>
          </QrWrap>
        ) : null}
      </Modal>
    </Page>
  );
};

export default ClientProfilePage;
