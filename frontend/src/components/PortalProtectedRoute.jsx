import React from "react";
import { Navigate, useLocation } from "react-router-dom";

const PortalProtectedRoute = ({ children }) => {
    const token = sessionStorage.getItem('portalAuthToken') || localStorage.getItem('portalAuthToken');
    const location = useLocation();
    const hasToken = Boolean(token);

    if (!hasToken) {
        return <Navigate to="/portal/login" state={{ from: location }} replace />;
    }

    return children;
};

export default PortalProtectedRoute;
