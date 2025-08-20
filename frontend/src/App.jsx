import React from 'react';
import { Routes, Route } from 'react-router-dom';
import styled from 'styled-components';
import { useAuth } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import MainLayout from './pages/MainLayout';

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
            <Route path="/login" element={<LoginPage />} />
            
            <Route 
                path="/*"
                element={
                    <ProtectedRoute>
                        <MainLayout />
                    </ProtectedRoute>
                } 
            />
        </Routes>
    );
};

export default App;