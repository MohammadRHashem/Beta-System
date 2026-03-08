import React from 'react';
import styled from 'styled-components';
import { IoMdClose } from 'react-icons/io';

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(7, 14, 27, 0.58);
  backdrop-filter: blur(7px);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  opacity: ${({ isOpen }) => (isOpen ? 1 : 0)};
  visibility: ${({ isOpen }) => (isOpen ? 'visible' : 'hidden')};
  transition: opacity 0.3s ease, visibility 0.3s ease;
  padding: 1rem;
`;

// DEFINITIVE UI FIX: The ModalContent now accepts a `maxWidth` prop.
// If no prop is given, it defaults to 500px.
const ModalContent = styled.div`
  background: ${({ theme }) => theme.surface};
  padding: 1.2rem 1.2rem 1rem;
  border-radius: 18px;
  border: 1px solid ${({ theme }) => theme.border};
  width: 90%;
  max-width: ${({ maxWidth }) => maxWidth || '500px'};
  max-height: min(86vh, 780px);
  overflow: auto;
  position: relative;
  box-shadow: ${({ theme }) => theme.shadowMd};
  animation: modalEnter 0.18s ease-out;

  @media (min-width: 768px) {
    padding: 1.5rem;
  }

  @keyframes modalEnter {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.985);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: transparent;
  border: 1px solid ${({ theme }) => theme.border};
  font-size: 1.22rem;
  cursor: pointer;
  color: ${({ theme }) => theme.lightText};
  border-radius: 999px;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: ${({ theme }) => theme.surfaceAlt};
    color: ${({ theme }) => theme.primary};
  }
`;

const Modal = ({ isOpen, onClose, children, maxWidth }) => {
  if (!isOpen) return null;

  return (
    <ModalOverlay isOpen={isOpen} onClick={onClose}>
      <ModalContent maxWidth={maxWidth} onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={onClose}><IoMdClose /></CloseButton>
        {children}
      </ModalContent>
    </ModalOverlay>
  );
};

export default Modal;
