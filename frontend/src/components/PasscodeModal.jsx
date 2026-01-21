// frontend/src/components/PasscodeModal.jsx

import React, { useState, useEffect } from 'react';
import styled, { keyframes, css } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FaBackspace } from 'react-icons/fa';
import Modal from './Modal';

const shakeAnimation = keyframes`
  10%, 90% { transform: translate3d(-1px, 0, 0); }
  20%, 80% { transform: translate3d(2px, 0, 0); }
  30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
  40%, 60% { transform: translate3d(4px, 0, 0); }
`;

const Container = styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
`;

const Title = styled.h3`
    color: ${({ theme }) => theme.primary};
    margin: 0;
`;

const PinDisplay = styled.div`
    display: flex;
    gap: 1rem;
    height: 40px;
    align-items: center;
    ${({ error }) => error && css`animation: ${shakeAnimation} 0.82s cubic-bezier(.36,.07,.19,.97) both;`}
`;

const PinDot = styled.div`
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: ${({ active, theme }) => (active ? theme.primary : theme.border)};
    transition: background-color 0.2s;
`;

const ErrorMessage = styled.p`
    color: ${({ theme }) => theme.error};
    font-size: 0.9rem;
    font-weight: 500;
    height: 1.2em;
`;

const Keypad = styled.div`
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
`;

const Key = styled(motion.button)`
    width: 70px;
    height: 70px;
    border-radius: 50%;
    border: 1px solid ${({ theme }) => theme.border};
    background: #fff;
    font-size: 1.8rem;
    font-weight: 300;
    color: ${({ theme }) => theme.primary};
    cursor: pointer;
    display: flex;
    justify-content: center;
    align-items: center;
    
    &:hover {
        background: #f6f9fc;
    }
`;

const PasscodeModal = ({ isOpen, onClose, onSubmit, error, clearError }) => {
    const [pin, setPin] = useState('');
    const PIN_LENGTH = 4;

    useEffect(() => {
        if (!isOpen) {
            setPin('');
            clearError();
        }
    }, [isOpen, clearError]);

    const handleKeyPress = (num) => {
        clearError();
        if (pin.length < PIN_LENGTH) {
            setPin(pin + num);
        }
    };

    const handleBackspace = () => {
        clearError();
        setPin(pin.slice(0, -1));
    };
    
    useEffect(() => {
        if (pin.length === PIN_LENGTH) {
            onSubmit(pin);
        }
    }, [pin, onSubmit]);

    const keypadNumbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', ''];

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <Container>
                <Title>Enter Passcode to Undo</Title>
                <PinDisplay error={!!error}>
                    {[...Array(PIN_LENGTH)].map((_, i) => (
                        <PinDot key={i} active={i < pin.length} />
                    ))}
                </PinDisplay>
                <ErrorMessage>{error || ' '}</ErrorMessage>
                <Keypad>
                    {keypadNumbers.map((num) => (
                        <Key
                            key={num || 'empty'}
                            whileTap={{ scale: 0.9 }}
                            onClick={num ? () => handleKeyPress(num) : null}
                            style={{ visibility: num ? 'visible' : 'hidden' }}
                        >
                            {num}
                        </Key>
                    ))}
                    <Key whileTap={{ scale: 0.9 }} onClick={() => handleKeyPress('0')}>0</Key>
                    <Key whileTap={{ scale: 0.9 }} onClick={handleBackspace}><FaBackspace /></Key>
                </Keypad>
            </Container>
        </Modal>
    );
};

export default PasscodeModal;