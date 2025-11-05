import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { portalLogin } from '../services/api';
import BetaLogo from '../assets/betaLogo.png'; // Make sure this path is correct

const PageContainer = styled.div`
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    background-color: #0A2540;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cg fill='%23081E35' fill-opacity='0.4'%3E%3Crect x='0' y='0' width='100' height='1'/%3E%3Crect x='0' y='0' width='1' height='100'/%3E%3C/g%3E%3C/svg%3E");
`;

const FormContainer = styled(motion.div)`
    width: 100%;
    max-width: 420px;
    padding: 3rem;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 15px 35px rgba(0,0,0,0.15);
    text-align: center;
`;

const Logo = styled.img`
    max-width: 180px;
    margin-bottom: 2rem;
`;

const Title = styled.h2`
    margin-bottom: 0.5rem;
    color: ${({ theme }) => theme.primary};
    font-size: 1.8rem;
`;

const Subtitle = styled.p`
    margin-bottom: 2.5rem;
    color: ${({ theme }) => theme.lightText};
`;

const Form = styled.form`
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
`;

const Input = styled.input`
    padding: 1rem;
    border: 1px solid ${({ theme }) => theme.border};
    border-radius: 6px;
    font-size: 1rem;
    transition: all 0.2s ease-in-out;

    &:focus {
        outline: none;
        border-color: ${({ theme }) => theme.secondary};
        box-shadow: 0 0 0 3px rgba(0, 196, 154, 0.2);
    }
`;

const Button = styled.button`
    padding: 1rem;
    border: none;
    background: linear-gradient(45deg, #00C49A, #00A885);
    color: white;
    font-size: 1.1rem;
    font-weight: bold;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease-in-out;
    box-shadow: 0 4px 15px rgba(0, 196, 154, 0.2);

    &:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(0, 196, 154, 0.3);
    }
`;

const ErrorMessage = styled.p`
    color: ${({ theme }) => theme.error};
    margin-top: 1rem;
    font-size: 0.9rem;
`;

const ClientLoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const { data } = await portalLogin({ username, password });
            localStorage.setItem('portalAuthToken', data.token);
            localStorage.setItem('portalClient', JSON.stringify(data.client));
            navigate('/portal/dashboard');
        } catch (err) {
            setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
        }
    };

    return (
        <PageContainer>
            <FormContainer
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
            >
                <Logo src={BetaLogo} alt="Beta Logo" />
                <Title>Client Portal</Title>
                <Subtitle>Access your transaction history</Subtitle>
                <Form onSubmit={handleSubmit}>
                    <Input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" required />
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" required />
                    <Button type="submit">Sign In</Button>
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                </Form>
            </FormContainer>
        </PageContainer>
    );
};

export default ClientLoginPage;