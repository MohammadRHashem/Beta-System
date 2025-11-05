import React from 'react';
import { Routes, Route } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import PortalProtectedRoute from './components/PortalProtectedRoute'

import LoginPage from './pages/LoginPage';
import MainLayout from './pages/MainLayout';

import ClientLoginPage from './pages/ClientLoginPage';
import PortalLayout from './pages/PortalLayout';
import ClientDashboard from './pages/ClientDashboard';

const LoadingContainer = styled.div`
    width: 100vw;
    height: 100vh;
    display: flex;
    justify-content: center;
    align-items: center;
    font-size: 1.5rem;
    color: ${({ theme }) => theme.primary};
`;

const App = () => {
    const { loading } = useAuth();

    if (loading) {
        return <LoadingContainer>Loading Application...</LoadingContainer>;
    }

    return (
        <Routes>
            {/* === ADMIN ROUTES === */}
            <Route path="/login" element={<LoginPage />} />
            <Route 
                path="/*"
                element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                } 
            />

            {/* === CLIENT PORTAL ROUTES === */}
            <Route path="/portal/login" element={<ClientLoginPage />} />
            <Route 
                path="/portal/*" 
                element={
                    <PortalProtectedRoute>
                        <PortalLayout />
                    </PortalProtectedRoute>
                }
            >
                {/* Nested routes for the client portal */}
                <Route path="dashboard" element={<ClientDashboard />} />
            </Route>
        </Routes>
    );
};

export default App;